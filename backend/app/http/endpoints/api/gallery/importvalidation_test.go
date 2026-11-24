package gallery

import (
	"testing"

	"github.com/TicketsBot-cloud/gdl/objects/channel"
	"github.com/stretchr/testify/require"
)

func TestValidateImportTargets(t *testing.T) {
	const (
		textId     uint64 = 1
		newsId     uint64 = 2
		voiceId    uint64 = 3
		categoryId uint64 = 4
		foreignId  uint64 = 999
	)

	channels := []channel.Channel{
		{Id: textId, Type: channel.ChannelTypeGuildText},
		{Id: newsId, Type: channel.ChannelTypeGuildNews},
		{Id: voiceId, Type: channel.ChannelTypeGuildVoice},
		{Id: categoryId, Type: channel.ChannelTypeGuildCategory},
	}

	ptr := func(v uint64) *uint64 { return &v }

	tests := []struct {
		name     string
		channels []channel.Channel
		channel  *uint64
		category *uint64
		wantErr  bool
	}{
		{name: "neither supplied", channels: channels},
		{name: "text channel", channels: channels, channel: ptr(textId)},
		{name: "announcement channel", channels: channels, channel: ptr(newsId)},
		{name: "channel and category", channels: channels, channel: ptr(textId), category: ptr(categoryId)},
		{name: "channel from another guild", channels: channels, channel: ptr(foreignId), wantErr: true},
		{name: "category from another guild", channels: channels, category: ptr(foreignId), wantErr: true},
		{name: "valid channel, foreign category", channels: channels, channel: ptr(textId), category: ptr(foreignId), wantErr: true},
		{name: "voice channel as panel channel", channels: channels, channel: ptr(voiceId), wantErr: true},
		{name: "category as panel channel", channels: channels, channel: ptr(categoryId), wantErr: true},
		{name: "text channel as category", channels: channels, category: ptr(textId), wantErr: true},
		{name: "zero channel id", channels: channels, channel: ptr(0), wantErr: true},
		{name: "empty guild channel list", channels: nil, channel: ptr(textId), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := validateImportTargets(tt.channels, tt.channel, tt.category)
			if tt.wantErr {
				require.NotEmpty(t, msg)
			} else {
				require.Empty(t, msg)
			}
		})
	}
}
