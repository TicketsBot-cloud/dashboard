package whitelabeltokens

import (
	"testing"

	"github.com/TicketsBot-cloud/common/encryption"
	"github.com/TicketsBot-cloud/database"
	"github.com/stretchr/testify/require"
)

const (
	keyA = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
	keyB = "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8="
)

func TestInit(t *testing.T) {
	tests := []struct {
		name    string
		keys    string
		active  string
		wantErr bool
	}{
		{"valid", "1:" + keyA, "1", false},
		{"two keys", "1:" + keyA + ",2:" + keyB, "2", false},
		{"missing keys", "", "1", true},
		{"missing active version", "1:" + keyA, "", true},
		{"active version without key", "1:" + keyA, "2", true},
		{"short key", "1:AAEC", "1", true},
		{"duplicate version", "1:" + keyA + ",1:" + keyB, "1", true},
		{"garbage", "not-a-keyring", "1", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Cleanup(func() { SetKeyring(nil) })

			err := Init(tt.keys, tt.active)
			if tt.wantErr {
				require.Error(t, err)
				require.NotContains(t, err.Error(), keyA)
				require.NotContains(t, err.Error(), keyB)
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestSealAndToken(t *testing.T) {
	require.NoError(t, Init("1:"+keyA, "1"))
	t.Cleanup(func() { SetKeyring(nil) })

	sealed, version, err := Seal(9, "secret")
	require.NoError(t, err)

	legacy := "legacy"

	tests := []struct {
		name    string
		bot     database.WhitelabelBot
		want    string
		wantErr bool
	}{
		{"sealed", database.WhitelabelBot{BotId: 9, TokenCiphertext: sealed, TokenKeyVersion: &version}, "secret", false},
		{"legacy wins", database.WhitelabelBot{BotId: 9, Token: &legacy, TokenCiphertext: sealed, TokenKeyVersion: &version}, legacy, false},
		{"other bot id", database.WhitelabelBot{BotId: 10, TokenCiphertext: sealed, TokenKeyVersion: &version}, "", true},
		{"nothing stored", database.WhitelabelBot{BotId: 9}, "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Token(tt.bot)
			if tt.wantErr {
				require.Error(t, err)
				require.Empty(t, got)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}

	_, _, err = Seal(9, "")
	require.ErrorIs(t, err, encryption.ErrEmptyToken)
}

func TestUnconfigured(t *testing.T) {
	SetKeyring(nil)

	_, _, err := Seal(1, "x")
	require.ErrorIs(t, err, ErrNotConfigured)

	_, err = Token(database.WhitelabelBot{BotId: 1})
	require.ErrorIs(t, err, ErrNotConfigured)
}
