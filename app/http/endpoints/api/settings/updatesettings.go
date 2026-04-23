package api

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/channel"
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
	addToWaitGroup(group, guildId, settings.updateAutoClose)

	if premiumTier > premium.None {
		addToWaitGroup(group, guildId, settings.updateColours)
	}

	if err := group.Wait(); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to save settings. Please try again."))
		return
	}

	settings.updateUsersCanClose(guildId)
	settings.updateCloseConfirmation(guildId)
	settings.updateFeedbackEnabled(guildId)

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionSettingsUpdate,
		ResourceType: database.AuditResourceSettings,
		OldData:      oldSettings,
		NewData:      settings,
	})

	ctx.JSON(200, gin.H{
	})
}

func (s *Settings) updateSettings(ctx context.Context, guildId uint64) error {
	return dbclient.Client.Settings.Set(ctx, guildId, s.Settings)
}

func (s *Settings) updateClaimSettings(ctx context.Context, guildId uint64) error {
	return dbclient.Client.ClaimSettings.Set(ctx, guildId, s.ClaimSettings)
}

var (
	validAutoArchive = []int{60, 1440, 4320, 10080}
	activeColours    = []customisation.Colour{customisation.Green, customisation.Red}
)

func (s *Settings) Validate(ctx context.Context, guildId uint64, premiumTier premium.PremiumTier) error {
	// Sync checks
	if s.ClaimSettings.SupportCanType && !s.ClaimSettings.SupportCanView {
		return errors.New("Must be able to view channel to type")
	}

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

	// Validate autoclose
	if premiumTier < premium.Premium {
		s.AutoCloseSettings.SinceOpenWithNoResponse = 0
		s.AutoCloseSettings.SinceLastMessage = 0
	}

	if !s.AutoCloseSettings.Enabled {
		s.AutoCloseSettings.SinceOpenWithNoResponse = 0
		s.AutoCloseSettings.SinceLastMessage = 0
		s.AutoCloseSettings.OnUserLeave = false
	}

	if s.AutoCloseSettings.SinceOpenWithNoResponse < 0 {
		s.AutoCloseSettings.SinceOpenWithNoResponse = 0
	}

	if s.AutoCloseSettings.SinceLastMessage < 0 {
		s.AutoCloseSettings.SinceLastMessage = 0
	}

	if s.AutoCloseSettings.SinceLastMessage > int64((time.Hour*24*60).Seconds()) ||
		s.AutoCloseSettings.SinceOpenWithNoResponse > int64((time.Hour*24*60).Seconds()) {
		return errors.New("Autoclose time period cannot be longer than 60 days")
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

	group.Go(func() error {
		valid := false
		for _, duration := range validAutoArchive {
			if duration == s.Settings.ThreadArchiveDuration {
				valid = true
				break
			}
		}

		if !valid {
			return fmt.Errorf("Invalid thread auto archive duration")
		}

		return nil
	})

	group.Go(func() error {
		if s.Settings.OverflowCategoryId != nil {
			ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
			defer cancel()

			ch, err := cache.Instance.GetChannel(ctx, *s.Settings.OverflowCategoryId)
			if err != nil {
				return fmt.Errorf("Invalid overflow category")
			}

			if ch.GuildId != guildId {
				return fmt.Errorf("Overflow category guild ID does not match")
			}

			if ch.Type != channel.ChannelTypeGuildCategory {
				return fmt.Errorf("Overflow category is not a category")
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

func (s *Settings) updateUsersCanClose(guildId uint64) {
	go dbclient.Client.UsersCanClose.Set(context.Background(), guildId, s.UsersCanClose)
}

func (s *Settings) updateCloseConfirmation(guildId uint64) {
	go dbclient.Client.CloseConfirmation.Set(context.Background(), guildId, s.CloseConfirmation)
}

func (s *Settings) updateFeedbackEnabled(guildId uint64) {
	go dbclient.Client.FeedbackEnabled.Set(context.Background(), guildId, s.FeedbackEnabled)
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

func (s *Settings) updateAutoClose(guildId uint64) error {
	data := s.AutoCloseSettings.ConvertToDatabase() // Already validated
	return dbclient.Client.AutoClose.Set(context.Background(), guildId, data)
}

func (d AutoCloseData) ConvertToDatabase() (settings database.AutoCloseSettings) {
	settings.Enabled = d.Enabled

	if d.SinceOpenWithNoResponse > 0 {
		duration := time.Second * time.Duration(d.SinceOpenWithNoResponse)
		settings.SinceOpenWithNoResponse = &duration
	}

	if d.SinceLastMessage > 0 {
		duration := time.Second * time.Duration(d.SinceLastMessage)
		settings.SinceLastMessage = &duration
	}

	settings.OnUserLeave = &d.OnUserLeave
	return
}
