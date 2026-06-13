package gallery

import (
	stdjson "encoding/json"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	api_automations "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/automations"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

// automationLimitForTier mirrors the per-guild automation quota used by the
// automation create endpoint. Kept in sync manually; if the caps change there
// they should change here too.
func automationLimitForTier(tier premium.PremiumTier) int {
	switch {
	case tier >= premium.Whitelabel:
		return 100
	case tier > premium.None:
		return 50
	default:
		return 3
	}
}

// maxStepsForTier mirrors the per-automation step cap used by the automations
// create/publish validators. Kept in sync manually with automations.limitsForTier.
func maxStepsForTier(tier premium.PremiumTier) int {
	switch {
	case tier >= premium.Whitelabel:
		return 200
	case tier > premium.None:
		return 100
	default:
		return 10
	}
}

// ImportAutomationHandler handles POST /api/:id/gallery/import-automation/:listingId
// Imports a gallery automation listing as a new draft automation in the guild.
func ImportAutomationHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	listingId, err := strconv.Atoi(ctx.Param("listingId"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid listing ID"))
		return
	}

	listing, ok, err := dbclient.Client.GalleryListings.GetById(ctx, listingId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch gallery listing"))
		return
	}

	if !ok || listing.Status != database.GalleryListingStatusApproved {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Gallery listing not found or not approved"))
		return
	}

	if listing.ListingType != database.GalleryListingTypeAutomation {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("This listing is not an automation"))
		return
	}

	var snapshot database.GalleryAutomationSnapshot
	if err := stdjson.Unmarshal(listing.SnapshotData, &snapshot); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to parse automation snapshot data"))
		return
	}

	botCtx, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord"))
		return
	}

	tier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, false, botCtx.Token, botCtx.RateLimiter)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to verify premium status"))
		return
	}

	if snapshot.Premium && tier == premium.None {
		ctx.JSON(http.StatusPaymentRequired, utils.ErrorStr("This automation requires premium features"))
		return
	}

	maxAutomations := automationLimitForTier(tier)

	// Deep copy and rewrite node IDs so the imported automation doesn't share
	// identifiers with the original.
	graphCopy := snapshot.Graph
	database.RewriteAutomationNodeIds(&graphCopy)

	// Validate the imported graph against the importing guild's tier limits.
	// Gallery snapshots may have been created under a higher tier than the
	// importing guild, so re-validation is required.
	maxSteps := maxStepsForTier(tier)
	if msg := api_automations.ValidateGraph(graphCopy, maxSteps, tier); msg != "" {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr(msg))
		return
	}

	desc := listing.Description
	id, err := dbclient.Client.Automations.CreateWithLimit(ctx, guildId, maxAutomations, listing.Name, &desc, graphCopy, userId)
	if err != nil {
		if err == database.ErrAutomationQuotaExceeded {
			ctx.JSON(http.StatusPaymentRequired, utils.ErrorStr("Automation quota reached (max %d). Upgrade to premium for more.", maxAutomations))
			return
		}
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create automation from gallery listing"))
		return
	}

	if err := dbclient.Client.GalleryListings.IncrementImportCount(ctx, listingId); err != nil {
		_ = app.NewError(err, "Failed to increment gallery listing import count")
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionGalleryImport,
		ResourceType: database.AuditResourceGalleryListing,
		ResourceId:   audit.StringPtr(strconv.Itoa(listingId)),
		NewData: map[string]any{
			"listing_type":  "automation",
			"automation_id": id,
			"listing_id":    listingId,
		},
	})

	ctx.JSON(http.StatusOK, gin.H{
		"success":       true,
		"automation_id": id,
	})
}
