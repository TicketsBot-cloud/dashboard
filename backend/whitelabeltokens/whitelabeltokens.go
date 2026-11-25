// Package whitelabeltokens holds the keyring that protects whitelabel bot
// tokens at rest and the two operations the dashboard needs: seal a token for
// storage and read one back from a stored row.
package whitelabeltokens

import (
	"errors"
	"fmt"
	"sync/atomic"

	"github.com/TicketsBot-cloud/common/encryption"
	"github.com/TicketsBot-cloud/database"
)

var ErrNotConfigured = errors.New("whitelabeltokens: keyring not configured")

var keyring atomic.Pointer[encryption.Keyring]

// Init parses the key configuration. The returned error never contains key
// material, so callers may log it.
func Init(keys, activeVersion string) error {
	ring, err := encryption.ParseKeyring(keys, activeVersion)
	if err != nil {
		return fmt.Errorf("whitelabel token keys: %w", err)
	}

	keyring.Store(ring)
	return nil
}

// SetKeyring installs an already built keyring.
func SetKeyring(ring *encryption.Keyring) {
	keyring.Store(ring)
}

// Seal encrypts a token for the given bot under the active key.
func Seal(botId uint64, token string) ([]byte, int16, error) {
	ring := keyring.Load()
	if ring == nil {
		return nil, 0, ErrNotConfigured
	}

	return ring.Seal(botId, token)
}

// Token returns the usable token of a stored row. A failure is returned as is:
// there is no fallback to any other token.
func Token(bot database.WhitelabelBot) (string, error) {
	ring := keyring.Load()
	if ring == nil {
		return "", ErrNotConfigured
	}

	return ring.ResolveStored(bot.BotId, bot.Token, bot.TokenCiphertext, bot.TokenKeyVersion)
}
