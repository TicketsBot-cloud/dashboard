package admin_integrations

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/dashboard/config"
	"github.com/TicketsBot-cloud/dashboard/log"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel/embed"
	"github.com/TicketsBot-cloud/gdl/objects/channel/message"
	"github.com/TicketsBot-cloud/gdl/rest"
	"go.uber.org/zap"
)

const (
	colourApproved   = 0x3ba55d
	colourRejected   = 0xed4245
	colourUnapproved = 0xfaa61a
)

const embedFieldValueRuneLimit = 1024

func postReviewWebhook(ctx context.Context, title string, colour int, integration database.CustomIntegration, reviewerId uint64, reason *string) error {
	e := embed.NewEmbed().
		SetTitle(title).
		SetColor(colour).
		AddField("Integration ID", strconv.Itoa(integration.Id), true).
		AddField("Name", integration.Name, true).
		AddField("Owner", fmt.Sprintf("<@%d>", integration.OwnerId), true).
		AddField("Reviewer", fmt.Sprintf("<@%d>", reviewerId), true)

	if reason != nil && *reason != "" {
		e.AddField("Reason", formatReasonForEmbed(*reason), false)
	}

	botCtx := botcontext.PublicContext()

	_, err := rest.ExecuteWebhook(
		ctx,
		config.Conf.Bot.PublicIntegrationRequestWebhookToken,
		botCtx.RateLimiter,
		config.Conf.Bot.PublicIntegrationRequestWebhookId,
		true,
		rest.WebhookBody{
			Embeds: utils.Slice(e),
			AllowedMentions: message.AllowedMention{
				Parse: []message.AllowedMentionType{},
			},
		},
	)

	return err
}

func postReviewWebhookBestEffort(ctx context.Context, title string, colour int, integration database.CustomIntegration, reviewerId uint64, reason *string) {
	if err := postReviewWebhook(ctx, title, colour, integration, reviewerId, reason); err != nil {
		log.Logger.Warn(
			"Failed to post integration review webhook",
			zap.Error(err),
			zap.Int("integration_id", integration.Id),
		)
	}
}

// formatReasonForEmbed wraps the user-supplied reason in a Discord code block so
// markdown and mention-like tokens are rendered as plain text. Any backticks in
// the reason are rewritten so they cannot break out of the code block. The
// final value is truncated by rune count to fit inside Discord's 1024-character
// embed field limit.
func formatReasonForEmbed(reason string) string {
	sanitised := strings.ReplaceAll(reason, "`", "'`'")

	const opener = "```\n"
	const closer = "\n```"
	overhead := utf8.RuneCountInString(opener) + utf8.RuneCountInString(closer)
	maxReasonRunes := embedFieldValueRuneLimit - overhead

	if utf8.RuneCountInString(sanitised) > maxReasonRunes {
		sanitised = truncateRunes(sanitised, maxReasonRunes)
	}

	return opener + sanitised + closer
}

func truncateRunes(s string, maxRunes int) string {
	if maxRunes <= 0 {
		return ""
	}
	if utf8.RuneCountInString(s) <= maxRunes {
		return s
	}
	runes := []rune(s)
	return string(runes[:maxRunes])
}
