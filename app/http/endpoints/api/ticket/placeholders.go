package api

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/TicketsBot-cloud/dashboard/botcontext"
	"github.com/TicketsBot-cloud/database"
)

// replacePlaceholders replaces common placeholders in content
func replacePlaceholders(ctx context.Context, content string, ticket *database.Ticket, botCtx *botcontext.BotContext) string {
	// Basic placeholders that don't require API calls
	content = strings.ReplaceAll(content, "%user_id%", strconv.FormatUint(ticket.UserId, 10))
	content = strings.ReplaceAll(content, "%user%", fmt.Sprintf("<@%d>", ticket.UserId))
	content = strings.ReplaceAll(content, "%ticket_id%", strconv.Itoa(ticket.Id))

	if ticket.ChannelId != nil {
		content = strings.ReplaceAll(content, "%channel%", fmt.Sprintf("<#%d>", *ticket.ChannelId))
	}

	// Time placeholders
	now := time.Now().Unix()
	content = strings.ReplaceAll(content, "%time%", fmt.Sprintf("<t:%d:t>", now))
	content = strings.ReplaceAll(content, "%date%", fmt.Sprintf("<t:%d:d>", now))
	content = strings.ReplaceAll(content, "%datetime%", fmt.Sprintf("<t:%d:f>", now))

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
		replaced := replacePlaceholders(ctx, *e.Title, ticket, botCtx)
		e.Title = &replaced
	}

	if e.Description != nil {
		replaced := replacePlaceholders(ctx, *e.Description, ticket, botCtx)
		e.Description = &replaced
	}

	if e.FooterText != nil {
		replaced := replacePlaceholders(ctx, *e.FooterText, ticket, botCtx)
		e.FooterText = &replaced
	}

	if e.AuthorName != nil {
		replaced := replacePlaceholders(ctx, *e.AuthorName, ticket, botCtx)
		e.AuthorName = &replaced
	}

	// Handle avatar URL placeholder
	if e.ImageUrl != nil && *e.ImageUrl == "%avatar_url%" {
		if user, err := botCtx.GetUser(ctx, ticket.UserId); err == nil {
			avatarUrl := user.AvatarUrl(256)
			e.ImageUrl = &avatarUrl
		}
	}

	if e.ThumbnailUrl != nil && *e.ThumbnailUrl == "%avatar_url%" {
		if user, err := botCtx.GetUser(ctx, ticket.UserId); err == nil {
			avatarUrl := user.AvatarUrl(256)
			e.ThumbnailUrl = &avatarUrl
		}
	}
}
