package api

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/TicketsBot-cloud/database"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	"github.com/ticketsbot-cloud/dashboard/backend/utils/types"
)

// replacePlaceholders replaces common placeholders in content
func replacePlaceholders(ctx context.Context, content string, ticket *database.Ticket, botCtx *botcontext.BotContext) string {
	return doReplacePlaceholders(ctx, content, ticket, botCtx, false)
}

func replacePlainTextPlaceholders(ctx context.Context, content string, ticket *database.Ticket, botCtx *botcontext.BotContext) string {
	return doReplacePlaceholders(ctx, content, ticket, botCtx, true)
}

func doReplacePlaceholders(ctx context.Context, content string, ticket *database.Ticket, botCtx *botcontext.BotContext, plainTextOnly bool) string {
	// Basic placeholders that don't require API calls
	content = strings.ReplaceAll(content, "%user_id%", strconv.FormatUint(ticket.UserId, 10))
	content = strings.ReplaceAll(content, "%ticket_id%", strconv.Itoa(ticket.Id))

	if !plainTextOnly {
		content = strings.ReplaceAll(content, "%user%", fmt.Sprintf("<@%d>", ticket.UserId))

		if ticket.ChannelId != nil {
			content = strings.ReplaceAll(content, "%channel%", fmt.Sprintf("<#%d>", *ticket.ChannelId))
		}

		now := time.Now().Unix()
		content = strings.ReplaceAll(content, "%time%", fmt.Sprintf("<t:%d:t>", now))
		content = strings.ReplaceAll(content, "%date%", fmt.Sprintf("<t:%d:d>", now))
		content = strings.ReplaceAll(content, "%datetime%", fmt.Sprintf("<t:%d:f>", now))
	}

	// Placeholders that require API calls (best effort, ignore errors)
	if user, err := botCtx.GetUser(ctx, ticket.UserId); err == nil {
		content = strings.ReplaceAll(content, "%username%", user.Username)
	}

	if member, err := botCtx.GetGuildMember(ctx, ticket.GuildId, ticket.UserId); err == nil {
		if member.Nick != "" {
			content = strings.ReplaceAll(content, "%nickname%", member.Nick)
		}
	}

	if guild, err := botCtx.GetGuild(ctx, ticket.GuildId); err == nil {
		content = strings.ReplaceAll(content, "%server%", guild.Name)
	}

	return content
}

// replacePlaceholdersInEmbed replaces placeholders in embed fields
func replacePlaceholdersInEmbed(ctx context.Context, e *database.CustomEmbed, ticket *database.Ticket, botCtx *botcontext.BotContext) {
	if e.Title != nil {
		replaced := replacePlainTextPlaceholders(ctx, *e.Title, ticket, botCtx)
		e.Title = &replaced
	}

	if e.Description != nil {
		replaced := replacePlaceholders(ctx, *e.Description, ticket, botCtx)
		e.Description = &replaced
	}

	if e.FooterText != nil {
		replaced := replacePlainTextPlaceholders(ctx, *e.FooterText, ticket, botCtx)
		e.FooterText = &replaced
	}

	if e.AuthorName != nil {
		replaced := replacePlainTextPlaceholders(ctx, *e.AuthorName, ticket, botCtx)
		e.AuthorName = &replaced
	}

	e.Url = replaceAvatarPlaceholder(ctx, e.Url, ticket, botCtx)
	e.ImageUrl = replaceAvatarPlaceholder(ctx, e.ImageUrl, ticket, botCtx)
	e.ThumbnailUrl = replaceAvatarPlaceholder(ctx, e.ThumbnailUrl, ticket, botCtx)
	e.AuthorIconUrl = replaceAvatarPlaceholder(ctx, e.AuthorIconUrl, ticket, botCtx)
	e.AuthorUrl = replaceAvatarPlaceholder(ctx, e.AuthorUrl, ticket, botCtx)
	e.FooterIconUrl = replaceAvatarPlaceholder(ctx, e.FooterIconUrl, ticket, botCtx)
}

func replaceAvatarPlaceholder(ctx context.Context, url *string, ticket *database.Ticket, botCtx *botcontext.BotContext) *string {
	if url == nil || *url != types.AvatarUrlPlaceholder {
		return url
	}

	user, err := botCtx.GetUser(ctx, ticket.UserId)
	if err != nil {
		fallback := types.DefaultAvatarUrl
		return &fallback
	}

	avatarUrl := user.AvatarUrl(256)
	return &avatarUrl
}
