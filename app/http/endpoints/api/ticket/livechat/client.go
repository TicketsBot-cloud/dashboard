package livechat

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type Client struct {
	Manager       *SocketManager
	Ws            *websocket.Conn
	RequestCtx    *gin.Context
	authenticated atomic.Bool
	GuildId       uint64
	TicketId      int
	tx            chan any
	flush         chan chan struct{}
	done          chan struct{}
	closeOnce     sync.Once
}

const (
	messageSizeLimit   = 1024 * 32
	keepaliveFrequency = 45 * time.Second
	keepaliveTimeout   = 60 * time.Second
	writeTimeout       = 10 * time.Second
)

func NewClient(manager *SocketManager, ws *websocket.Conn, c *gin.Context, guildId uint64, ticketId int) *Client {
	return &Client{
		Manager:    manager,
		Ws:         ws,
		RequestCtx: c,
		GuildId:    guildId,
		TicketId:   ticketId,
		tx:         make(chan any),
		flush:      make(chan chan struct{}),
		done:       make(chan struct{}),
	}
}

// Close signals shutdown to every goroutine working on this client. It is safe to call from any
// goroutine and any number of times: done is closed exactly once and never sent on. The tx
// channel is deliberately never closed, so a send racing a shutdown cannot panic.
func (c *Client) Close() {
	c.closeOnce.Do(func() {
		close(c.done)
	})
}

func (c *Client) StartReadLoop() error {
	defer func() {
		// Signal shutdown first so the write loop exits and any in-flight Write (including the
		// manager broadcast) unblocks immediately, then unregister, then tear down the socket.
		c.Close()
		c.Manager.unregister <- c
		_ = c.Ws.Close()
	}()

	// Set up connection properties
	c.Ws.SetReadLimit(messageSizeLimit)
	if err := c.Ws.SetReadDeadline(time.Now().Add(keepaliveTimeout)); err != nil {
		return err
	}

	c.Ws.SetPongHandler(func(appData string) error {
		return c.Ws.SetReadDeadline(time.Now().Add(keepaliveTimeout))
	})

	for {
		var event Event
		if err := c.Ws.ReadJSON(&event); err != nil {
			return err
		}

		if !c.authenticated.Load() && event.Type != EventTypeAuth {
			if err := c.Ws.WriteJSON(NewErrorMessage("Unauthorized")); err != nil {
				return err
			}

			return nil
		}

		if err := c.HandleEvent(event); err != nil {
			c.RequestCtx.Error(err)
			c.Write(NewErrorMessage(err.Error()))
			c.Flush()
			_ = c.Ws.Close()
			return err
		}
	}
}

// Write queues a message for the write loop. It never panics and never blocks past shutdown:
// once Close has been called the done case wins and the message is dropped. tx is unbuffered and
// has several senders (read loop, auth handler, manager broadcast), so this select is what keeps
// a send from racing teardown or wedging the manager goroutine on a dead write loop.
func (c *Client) Write(msg any) {
	select {
	case c.tx <- msg:
	case <-c.done:
	}
}

func (c *Client) StartWriteLoop() error {
	ticker := time.NewTicker(keepaliveFrequency)
	defer func() {
		ticker.Stop()
		// If the write loop exits on its own (e.g. a websocket write error), signal shutdown so
		// pending and future Write calls unblock instead of stalling the manager goroutine.
		c.Close()
		_ = c.Ws.Close()
	}()

	for {
		select {
		case <-c.done:
			_ = c.Ws.SetWriteDeadline(time.Now().Add(writeTimeout))
			_ = c.Ws.WriteMessage(websocket.CloseMessage, []byte{})
			return nil
		case message := <-c.tx:
			if err := c.Ws.SetWriteDeadline(time.Now().Add(writeTimeout)); err != nil {
				return err
			}

			if err := c.Ws.WriteJSON(message); err != nil {
				return err
			}
		case <-ticker.C:
			if err := c.Ws.SetWriteDeadline(time.Now().Add(writeTimeout)); err != nil {
				return err
			}

			if err := c.Ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				return err
			}
		case ch := <-c.flush:
			ch <- struct{}{}
		}
	}
}

// Flush blocks until the write loop has processed everything queued before this call, or until
// shutdown or a one second timeout. Both the request and the wait select on done so a dead write
// loop cannot hang the caller.
func (c *Client) Flush() {
	// Buffered so the write loop's reply never blocks even if this caller has already returned
	// via the done or timeout cases below.
	ch := make(chan struct{}, 1)

	select {
	case c.flush <- ch:
	case <-c.done:
		return
	}

	select {
	case <-ch:
	case <-c.done:
	case <-time.After(time.Second):
	}
}
