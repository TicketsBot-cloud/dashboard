package api

import (
	"bytes"
	"context"
	"fmt"
	"time"

	"github.com/TicketsBot-cloud/common/tokenchange"
	"github.com/TicketsBot-cloud/common/whitelabeldelete"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/redis"
	"github.com/ticketsbot-cloud/dashboard/backend/whitelabeltokens"
)

// rollbackTimeout bounds the rollback on its own clock, because the request
// context is usually already cancelled when a rollback is needed.
const rollbackTimeout = 10 * time.Second

// rollbackStore holds the conditional statements a rollback is built from.
// Both report false when the row no longer holds the value this request wrote.
type rollbackStore interface {
	RestoreEncryptedIfCurrent(ctx context.Context, userId, rejectedBotId uint64, written []byte, botId uint64, publicKey string, sealed []byte, version int16) (bool, error)
	DeleteIfCurrent(ctx context.Context, userId, botId uint64, written []byte) (bool, error)
}

type tokenSealer func(botId uint64, token string) ([]byte, int16, error)

type invalidationPublisher func(tokenchange.TokenChangeData)

type deletePublisher func(botId uint64)

type rollbackDeps struct {
	store               rollbackStore
	seal                tokenSealer
	publishInvalidation invalidationPublisher
	publishDelete       deletePublisher
}

type liveRollbackStore struct{}

func (liveRollbackStore) RestoreEncryptedIfCurrent(ctx context.Context, userId, rejectedBotId uint64, written []byte, botId uint64, publicKey string, sealed []byte, version int16) (bool, error) {
	return dbclient.Client.Whitelabel.RestoreEncryptedIfCurrent(ctx, userId, rejectedBotId, written, botId, publicKey, sealed, version)
}

func (liveRollbackStore) DeleteIfCurrent(ctx context.Context, userId, botId uint64, written []byte) (bool, error) {
	return dbclient.Client.Whitelabel.DeleteIfCurrent(ctx, userId, botId, written)
}

func publishRollbackInvalidation(data tokenchange.TokenChangeData) {
	_ = tokenchange.PublishTokenChange(redis.Client.Client, data)
}

func publishRollbackDelete(botId uint64) {
	whitelabeldelete.Publish(redis.Client.Client, botId)
}

// rollbackAfterRejection runs the rollback detached from the request's
// cancellation so a client that disconnects cannot leave the rejected token stored.
func rollbackAfterRejection(c *gin.Context, userId, rejectedBotId uint64, written []byte, previous database.WhitelabelBot) error {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(c), rollbackTimeout)
	defer cancel()

	return rollbackWhitelabelRow(ctx, rollbackDeps{
		store:               liveRollbackStore{},
		seal:                whitelabeltokens.Seal,
		publishInvalidation: publishRollbackInvalidation,
		publishDelete:       publishRollbackDelete,
	}, userId, rejectedBotId, written, previous)
}

// rollbackWhitelabelRow undoes the row this request wrote before Discord
// accepted the new token. It only acts while the row still holds the sealed
// value this request wrote (the random nonce identifies the write), so a
// concurrent request that has since replaced the row is left alone.
//
// When the user already had a different bot, that row is restored rather than
// deleted so a failed replacement cannot destroy a working bot. The previous token is
// chosen with the same precedence as the readers: a non-empty legacy plaintext
// value is sealed and wins, because an old pod may have updated only that
// column. Otherwise the previous ciphertext is restored byte for byte.
//
// When the previous bot is the rejected bot, the new token was already
// accepted by Discord as that bot's credential, whereas the previous token may
// have been revoked (which is a common reason to submit a new one). Restoring
// it could make the sharder delete a working bot, so the row keeps the new
// token and only caches are dropped.
//
// When the row is removed or switched back to a different bot, the rejected
// bot is also told to stop, since a shard may have started in the window
// between the write and the rollback.
func rollbackWhitelabelRow(ctx context.Context, deps rollbackDeps, userId, rejectedBotId uint64, written []byte, previous database.WhitelabelBot) error {
	store, seal := deps.store, deps.seal

	if previous.BotId == rejectedBotId {
		deps.publishInvalidation(tokenchange.TokenChangeData{NewId: previous.BotId, OldId: rejectedBotId})
		return nil
	}

	var (
		applied bool
		err     error
	)

	// Workers may have cached the rejected token while the row existed. The
	// outcome is unknown after an error, and dropping a cache entry is harmless.
	defer func() {
		if applied || err != nil {
			deps.publishInvalidation(tokenchange.TokenChangeData{NewId: previous.BotId, OldId: rejectedBotId})
		}

		if applied && previous.BotId != rejectedBotId {
			deps.publishDelete(rejectedBotId)
		}
	}()

	if previous.BotId == 0 {
		applied, err = store.DeleteIfCurrent(ctx, userId, rejectedBotId, written)
		if err != nil {
			return fmt.Errorf("deleting new whitelabel row: %w", err)
		}

		return nil
	}

	sealed, version, sealErr := previousSealed(seal, previous)
	if sealErr != nil {
		return sealErr
	}

	applied, err = store.RestoreEncryptedIfCurrent(ctx, userId, rejectedBotId, written, previous.BotId, previous.PublicKey, sealed, version)
	if err != nil {
		return fmt.Errorf("restoring previous whitelabel row: %w", err)
	}

	// A concurrent request or deletion replaced the row, and it may have only
	// signalled this request's bot. If the previous bot is still live, this only
	// makes it reconnect and re-read its row.
	if !applied {
		deps.publishDelete(previous.BotId)
	}

	return nil
}

func previousSealed(seal tokenSealer, previous database.WhitelabelBot) ([]byte, int16, error) {
	if previous.Token != nil && *previous.Token != "" {
		sealed, version, err := seal(previous.BotId, *previous.Token)
		if err != nil {
			return nil, 0, fmt.Errorf("sealing previous token: %w", err)
		}

		return sealed, version, nil
	}

	if len(previous.TokenCiphertext) == 0 || previous.TokenKeyVersion == nil {
		return nil, 0, fmt.Errorf("previous whitelabel row for bot %d has no token to restore", previous.BotId)
	}

	return bytes.Clone(previous.TokenCiphertext), *previous.TokenKeyVersion, nil
}
