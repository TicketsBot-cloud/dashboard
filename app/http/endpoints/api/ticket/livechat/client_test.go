package livechat

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// newTestClient builds a Client with just the channels the lifecycle methods touch. Manager and
// Ws are left nil deliberately: Write, Close and Flush never reference them.
func newTestClient() *Client {
	return &Client{
		tx:    make(chan any),
		flush: make(chan chan struct{}),
		done:  make(chan struct{}),
	}
}

// waitOrFail fails the test if the given function has not returned within d.
func waitOrFail(t *testing.T, d time.Duration, msg string, fn func()) {
	t.Helper()
	returned := make(chan struct{})
	go func() {
		fn()
		close(returned)
	}()
	select {
	case <-returned:
	case <-time.After(d):
		t.Fatal(msg)
	}
}

// TestClientWriteDuringShutdown is the core regression test: concurrent Write calls must never
// panic (tx is never closed) and must always return once Close is called, even when no goroutine
// is receiving from tx, which is what previously wedged the shared manager goroutine. Run under
// -race to also catch unsynchronised access.
func TestClientWriteDuringShutdown(t *testing.T) {
	tests := []struct {
		name           string
		senders        int
		drainThenStall bool // start a receiver, then stop it to mimic a dead write loop
	}{
		{name: "single sender, no receiver", senders: 1},
		{name: "many senders, no receiver", senders: 64},
		{name: "many senders, receiver dies mid-flight", senders: 64, drainThenStall: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := newTestClient()

			stopReceiver := make(chan struct{})
			if tt.drainThenStall {
				go func() {
					for {
						select {
						case <-c.tx:
						case <-stopReceiver:
							return
						}
					}
				}()
			}

			var wg sync.WaitGroup
			start := make(chan struct{})
			for i := 0; i < tt.senders; i++ {
				wg.Add(1)
				go func() {
					defer wg.Done()
					<-start
					c.Write("msg")
				}()
			}

			close(start)
			if tt.drainThenStall {
				close(stopReceiver) // no receiver from here on; Writes must fall back to done
			}
			c.Close()

			waitOrFail(t, 5*time.Second, "Write calls did not return after Close; possible wedge", wg.Wait)
		})
	}
}

// TestClientCloseIdempotent verifies Close can be called concurrently and repeatedly without
// panicking, and that it closes done exactly once.
func TestClientCloseIdempotent(t *testing.T) {
	c := newTestClient()

	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c.Close()
		}()
	}
	wg.Wait()

	select {
	case <-c.done:
	default:
		t.Fatal("done was not closed after Close")
	}

	require.NotPanics(t, c.Close, "Close must be safe to call again")
}

// TestClientWriteDeliversThenDropsAfterClose checks the happy path still works (a present
// receiver gets the message) and that after Close a Write with no receiver returns immediately
// rather than blocking.
func TestClientWriteDeliversThenDropsAfterClose(t *testing.T) {
	c := newTestClient()

	got := make(chan any, 1)
	go func() {
		select {
		case m := <-c.tx:
			got <- m
		case <-c.done:
		}
	}()

	c.Write("hello")

	select {
	case m := <-got:
		require.Equal(t, "hello", m)
	case <-time.After(time.Second):
		t.Fatal("message was not delivered to the waiting receiver")
	}

	c.Close()
	waitOrFail(t, time.Second, "Write blocked after Close with no receiver", func() {
		c.Write("dropped")
	})
}

// TestClientFlush covers the two safe exits of Flush: returning via done when no write loop is
// running, and completing normally when a handler replies (mirroring the write loop's flush case).
func TestClientFlush(t *testing.T) {
	t.Run("returns via done when no write loop", func(t *testing.T) {
		c := newTestClient()
		c.Close()
		waitOrFail(t, time.Second, "Flush blocked after Close", c.Flush)
	})

	t.Run("completes when handler replies", func(t *testing.T) {
		c := newTestClient()
		go func() {
			select {
			case ch := <-c.flush:
				ch <- struct{}{}
			case <-c.done:
			}
		}()
		waitOrFail(t, 2*time.Second, "Flush did not complete when a handler replied", c.Flush)
	})
}
