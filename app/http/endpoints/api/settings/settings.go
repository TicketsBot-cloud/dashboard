package api

import (
	"context"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/worker/bot/customisation"
	"github.com/TicketsBot-cloud/worker/i18n"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

type (
	Settings struct {
		database.Settings
		ClaimSettings database.ClaimSettings `json:"claim_settings"`
		Colours       ColourMap              `json:"colours"`
		Language      *string                `json:"language"`
	}

	ColourMap map[customisation.Colour]utils.HexColour
)

func loadSettings(ctx context.Context, guildId uint64) (Settings, error) {
	var settings Settings

	group, _ := errgroup.WithContext(ctx)

	group.Go(func() (err error) {
		settings.Settings, err = dbclient.Client.Settings.Get(ctx, guildId)
		return
	})

	group.Go(func() (err error) {
		settings.ClaimSettings, err = dbclient.Client.ClaimSettings.Get(ctx, guildId)
		return
	})

	group.Go(func() (err error) {
		settings.Colours, err = getColourMap(guildId)
		return
	})

	group.Go(func() error {
		locale, err := dbclient.Client.ActiveLanguage.Get(ctx, guildId)
		if err != nil {
			return err
		}

		if locale != "" {
			settings.Language = utils.Ptr(locale)
		}

		return nil
	})

	if err := group.Wait(); err != nil {
		return settings, err
	}

	return settings, nil
}

func GetSettingsHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	settings, err := loadSettings(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to process request. Please try again."))
		return
	}

	// short_code -> local_name
	type MinimalLocale struct {
		IsoShortCode string `json:"iso_short_code"`
		LocalName    string `json:"local_name"`
	}

	locales := make([]MinimalLocale, len(i18n.Locales))
	for i, locale := range i18n.Locales {
		locales[i] = MinimalLocale{
			IsoShortCode: locale.IsoShortCode,
			LocalName:    locale.LocalName,
		}
	}

	ctx.JSON(200, struct {
		Settings
		Locales []MinimalLocale `json:"locales"`
	}{
		Settings: settings,
		Locales:  locales,
	})
}

func getColourMap(guildId uint64) (ColourMap, error) {
	raw, err := dbclient.Client.CustomColours.GetAll(context.Background(), guildId)
	if err != nil {
		return nil, err
	}

	colours := make(ColourMap)
	for id, hex := range raw {
		if !utils.Exists(activeColours, customisation.Colour(id)) {
			continue
		}

		colours[customisation.Colour(id)] = utils.HexColour(hex)
	}

	for _, id := range activeColours {
		if _, ok := colours[id]; !ok {
			colours[id] = utils.HexColour(customisation.DefaultColours[id])
		}
	}

	return colours, nil
}
