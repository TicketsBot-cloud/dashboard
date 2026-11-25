package api

import (
	"context"
	"errors"
	"testing"

	"github.com/TicketsBot-cloud/common/tokenchange"
	"github.com/TicketsBot-cloud/database"
	"github.com/stretchr/testify/require"
)

type fakeRollbackStore struct {
	applied bool
	err     error

	restoreCalls []restoreCall
	deleteCalls  []deleteCall
}

type restoreCall struct {
	userId, rejected, botId uint64
	written, sealed         []byte
	publicKey               string
	version                 int16
}

type deleteCall struct {
	userId, botId uint64
	written       []byte
}

func (f *fakeRollbackStore) RestoreEncryptedIfCurrent(_ context.Context, userId, rejectedBotId uint64, written []byte, botId uint64, publicKey string, sealed []byte, version int16) (bool, error) {
	f.restoreCalls = append(f.restoreCalls, restoreCall{userId, rejectedBotId, botId, written, sealed, publicKey, version})
	return f.applied, f.err
}

func (f *fakeRollbackStore) DeleteIfCurrent(_ context.Context, userId, botId uint64, written []byte) (bool, error) {
	f.deleteCalls = append(f.deleteCalls, deleteCall{userId, botId, written})
	return f.applied, f.err
}

func TestRollbackWhitelabelRow(t *testing.T) {
	const (
		userId   = uint64(7)
		rejected = uint64(200)
		prevBot  = uint64(100)
	)

	written := []byte("written-by-this-request")
	prevCipher := []byte("previous-ciphertext")
	prevVersion := int16(2)
	legacy := "legacy-plaintext"
	empty := ""

	okSeal := func(botId uint64, token string) ([]byte, int16, error) {
		return []byte("sealed:" + token), 5, nil
	}
	failSeal := func(uint64, string) ([]byte, int16, error) { return nil, 0, errors.New("keyring down") }

	tests := []struct {
		name            string
		previous        database.WhitelabelBot
		rejected        uint64
		store           *fakeRollbackStore
		seal            tokenSealer
		wantErr         bool
		wantRestore     *restoreCall
		wantDelete      bool
		wantPublish     []tokenchange.TokenChangeData
		wantDeletePubOf []uint64
	}{
		{
			name:            "first create deletes and invalidates the rejected bot",
			previous:        database.WhitelabelBot{},
			store:           &fakeRollbackStore{applied: true},
			seal:            okSeal,
			wantDelete:      true,
			wantPublish:     []tokenchange.TokenChangeData{{NewId: 0, OldId: rejected}},
			wantDeletePubOf: []uint64{rejected},
		},
		{
			name:       "first create lost the race publishes nothing",
			previous:   database.WhitelabelBot{},
			store:      &fakeRollbackStore{applied: false},
			seal:       okSeal,
			wantDelete: true,
		},
		{
			name:            "same bot keeps the row and only invalidates",
			previous:        database.WhitelabelBot{BotId: rejected, PublicKey: "pk", TokenCiphertext: prevCipher, TokenKeyVersion: &prevVersion},
			store:           &fakeRollbackStore{applied: true},
			seal:            okSeal,
			wantPublish:     []tokenchange.TokenChangeData{{NewId: rejected, OldId: rejected}},
			wantDeletePubOf: nil,
		},
		{
			name:            "legacy plaintext is sealed and wins over stale ciphertext",
			previous:        database.WhitelabelBot{BotId: prevBot, PublicKey: "pk", Token: &legacy, TokenCiphertext: prevCipher, TokenKeyVersion: &prevVersion},
			store:           &fakeRollbackStore{applied: true},
			seal:            okSeal,
			wantRestore:     &restoreCall{userId: userId, rejected: rejected, botId: prevBot, written: written, sealed: []byte("sealed:" + legacy), publicKey: "pk", version: 5},
			wantPublish:     []tokenchange.TokenChangeData{{NewId: prevBot, OldId: rejected}},
			wantDeletePubOf: []uint64{rejected},
		},
		{
			name:            "plaintext only row is sealed",
			previous:        database.WhitelabelBot{BotId: prevBot, PublicKey: "pk", Token: &legacy},
			store:           &fakeRollbackStore{applied: true},
			seal:            okSeal,
			wantRestore:     &restoreCall{userId: userId, rejected: rejected, botId: prevBot, written: written, sealed: []byte("sealed:" + legacy), publicKey: "pk", version: 5},
			wantPublish:     []tokenchange.TokenChangeData{{NewId: prevBot, OldId: rejected}},
			wantDeletePubOf: []uint64{rejected},
		},
		{
			name:            "empty plaintext restores ciphertext byte for byte",
			previous:        database.WhitelabelBot{BotId: prevBot, PublicKey: "pk", Token: &empty, TokenCiphertext: prevCipher, TokenKeyVersion: &prevVersion},
			store:           &fakeRollbackStore{applied: true},
			seal:            failSeal,
			wantRestore:     &restoreCall{userId: userId, rejected: rejected, botId: prevBot, written: written, sealed: prevCipher, publicKey: "pk", version: prevVersion},
			wantPublish:     []tokenchange.TokenChangeData{{NewId: prevBot, OldId: rejected}},
			wantDeletePubOf: []uint64{rejected},
		},
		{
			name:            "ciphertext only restores byte for byte",
			previous:        database.WhitelabelBot{BotId: prevBot, PublicKey: "pk", TokenCiphertext: prevCipher, TokenKeyVersion: &prevVersion},
			store:           &fakeRollbackStore{applied: true},
			seal:            failSeal,
			wantRestore:     &restoreCall{userId: userId, rejected: rejected, botId: prevBot, written: written, sealed: prevCipher, publicKey: "pk", version: prevVersion},
			wantPublish:     []tokenchange.TokenChangeData{{NewId: prevBot, OldId: rejected}},
			wantDeletePubOf: []uint64{rejected},
		},
		{
			name:            "another request won the restore and the previous bot is signalled",
			previous:        database.WhitelabelBot{BotId: prevBot, PublicKey: "pk", TokenCiphertext: prevCipher, TokenKeyVersion: &prevVersion},
			store:           &fakeRollbackStore{applied: false},
			seal:            okSeal,
			wantRestore:     &restoreCall{userId: userId, rejected: rejected, botId: prevBot, written: written, sealed: prevCipher, publicKey: "pk", version: prevVersion},
			wantDeletePubOf: []uint64{prevBot},
		},
		{
			name:     "previous row without any token is an error and touches nothing",
			previous: database.WhitelabelBot{BotId: prevBot, PublicKey: "pk", Token: &empty},
			store:    &fakeRollbackStore{applied: true},
			seal:     okSeal,
			wantErr:  true,
		},
		{
			name:     "ciphertext without a key version is an error",
			previous: database.WhitelabelBot{BotId: prevBot, TokenCiphertext: prevCipher},
			store:    &fakeRollbackStore{applied: true},
			seal:     okSeal,
			wantErr:  true,
		},
		{
			name:     "sealing failure is an error and touches nothing",
			previous: database.WhitelabelBot{BotId: prevBot, Token: &legacy},
			store:    &fakeRollbackStore{applied: true},
			seal:     failSeal,
			wantErr:  true,
		},
		{
			name:        "store error on restore still drops caches",
			previous:    database.WhitelabelBot{BotId: prevBot, PublicKey: "pk", TokenCiphertext: prevCipher, TokenKeyVersion: &prevVersion},
			store:       &fakeRollbackStore{err: errors.New("db down")},
			seal:        okSeal,
			wantErr:     true,
			wantRestore: &restoreCall{userId: userId, rejected: rejected, botId: prevBot, written: written, sealed: prevCipher, publicKey: "pk", version: prevVersion},
			wantPublish: []tokenchange.TokenChangeData{{NewId: prevBot, OldId: rejected}},
		},
		{
			name:        "store error on delete still drops caches",
			previous:    database.WhitelabelBot{},
			store:       &fakeRollbackStore{err: errors.New("db down")},
			seal:        okSeal,
			wantErr:     true,
			wantDelete:  true,
			wantPublish: []tokenchange.TokenChangeData{{NewId: 0, OldId: rejected}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var (
				published []tokenchange.TokenChangeData
				deleted   []uint64
			)
			deps := rollbackDeps{
				store:               tt.store,
				seal:                tt.seal,
				publishInvalidation: func(d tokenchange.TokenChangeData) { published = append(published, d) },
				publishDelete:       func(id uint64) { deleted = append(deleted, id) },
			}

			err := rollbackWhitelabelRow(context.Background(), deps, userId, rejected, written, tt.previous)
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}

			if tt.wantRestore != nil {
				require.Len(t, tt.store.restoreCalls, 1)
				require.Equal(t, *tt.wantRestore, tt.store.restoreCalls[0])
			} else {
				require.Empty(t, tt.store.restoreCalls)
			}

			if tt.wantDelete {
				require.Equal(t, []deleteCall{{userId: userId, botId: rejected, written: written}}, tt.store.deleteCalls)
			} else {
				require.Empty(t, tt.store.deleteCalls)
			}

			require.Equal(t, tt.wantPublish, published)
			require.Equal(t, tt.wantDeletePubOf, deleted)
		})
	}
}

func TestPreviousSealedDoesNotAliasStoredCiphertext(t *testing.T) {
	cipher := []byte("abc")
	version := int16(1)

	got, _, err := previousSealed(nil, database.WhitelabelBot{BotId: 1, TokenCiphertext: cipher, TokenKeyVersion: &version})
	require.NoError(t, err)
	got[0] = 'z'
	require.Equal(t, []byte("abc"), cipher)
}
