package api

import (
	"context"
	"errors"
	"fmt"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/worker/bot/customisation"
	"github.com/TicketsBot-cloud/worker/i18n"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

func UpdateSettingsHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	var settings Settings
	if err := ctx.ShouldBindJSON(&settings); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	// Get a list of all channel IDs
	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	// Includes voting
	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, true, botContext.Token, botContext.RateLimiter)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to verify premium status. Please try again."))
		return
	}

	if err := settings.Validate(ctx, guildId, premiumTier); err != nil {
		ctx.JSON(400, utils.ErrorStr("%v", err))
		return
	}

	// Fetch current settings before mutation for audit diff
	oldSettings, err := loadSettings(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to save settings. Please try again."))
		return
	}

	group, _ := errgroup.WithContext(context.Background())

	group.Go(func() error {
		return settings.updateSettings(ctx, guildId)
	})

	group.Go(func() error {
		return settings.updateClaimSettings(ctx, guildId)
	})

	addToWaitGroup(group, guildId, settings.updateLanguage)

	if premiumTier > premium.None {
		addToWaitGroup(group, guildId, settings.updateColours)
	}

	if err := group.Wait(); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to save settings. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionSettingsUpdate,
		ResourceType: database.AuditResourceSettings,
		OldData:      oldSettings,
		NewData:      settings,
	})

	ctx.JSON(200, gin.H{})
}

func (s *Settings) updateSettings(ctx context.Context, guildId uint64) error {
	return dbclient.Client.Settings.Set(ctx, guildId, s.Settings)
}

func (s *Settings) updateClaimSettings(ctx context.Context, guildId uint64) error {
	return dbclient.Client.ClaimSettings.Set(ctx, guildId, s.ClaimSettings)
}

var activeColours = []customisation.Colour{customisation.Green, customisation.Red}

func (s *Settings) Validate(ctx context.Context, guildId uint64, premiumTier premium.PremiumTier) error {
	if s.Language != nil {
		if _, ok := i18n.MappedByIsoShortCode[*s.Language]; !ok {
			return errors.New("Invalid language")
		}
	}

	// Validate colours
	if len(s.Colours) > len(activeColours) {
		return errors.New("Invalid colour")
	}

	for colour := range s.Colours {
		if !utils.Exists(activeColours, colour) {
			return errors.New("Invalid colour")
		}
	}

	for _, colourCode := range activeColours {
		if _, ok := s.Colours[colourCode]; !ok {
			s.Colours[colourCode] = utils.HexColour(customisation.DefaultColours[colourCode])
		}
	}

	// Async checks
	group, _ := errgroup.WithContext(context.Background())

	// Validate panel from same guild
	group.Go(func() error {
		if s.ContextMenuPanel != nil {
			panelId := *s.ContextMenuPanel

			panel, err := dbclient.Client.Panel.GetById(ctx, panelId)
			if err != nil {
				return err
			}

			if guildId != panel.GuildId {
				return fmt.Errorf("guild ID doesn't match")
			}
		}

		return nil
	})

	return group.Wait()
}

func addToWaitGroup(group *errgroup.Group, guildId uint64, f func(uint64) error) {
	group.Go(func() error {
		return f(guildId)
	})
}

func (s *Settings) updateLanguage(guildId uint64) error {
	if s.Language == nil {
		return dbclient.Client.ActiveLanguage.Delete(context.Background(), guildId)
	} else {
		return dbclient.Client.ActiveLanguage.Set(context.Background(), guildId, string(*s.Language))
	}
}

func (s *Settings) updateColours(guildId uint64) error {
	// Convert ColourMap to primitives
	converted := make(map[int16]int)
	for colour, hex := range s.Colours {
		converted[int16(colour)] = int(hex)
	}

	return dbclient.Client.CustomColours.BatchSet(context.Background(), guildId, converted)
}
