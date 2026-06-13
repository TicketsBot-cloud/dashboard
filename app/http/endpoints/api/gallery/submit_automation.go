package gallery

import (
	stdjson "encoding/json"
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

// SubmitAutomationHandler handles POST /api/:id/gallery/submit-automation/:automationId
// Submits an automation from the guild to the gallery for review.
// Rate limiting should be applied at the route level.
func SubmitAutomationHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	automationIdStr := ctx.Param("automationId")
	automationId, err := strconv.ParseInt(automationIdStr, 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid automation ID"))
		return
	}

	var body submitBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body"))
		return
	}

	if len(body.Name) < 1 || len(body.Name) > 100 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Name must be between 1 and 100 characters"))
		return
	}

	if len(body.Description) < 1 || len(body.Description) > 500 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Description must be between 1 and 500 characters"))
		return
	}

	if !AllowedCategories[body.Category] {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid category"))
		return
	}

	if len(body.Tags) > 3 {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("A maximum of 3 tags is allowed"))
		return
	}
	for _, tag := range body.Tags {
		if len(tag) < 1 || len(tag) > 30 {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Each tag must be between 1 and 30 characters"))
			return
		}
	}

	automation, found, err := dbclient.Client.Automations.Get(ctx, automationId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch automation"))
		return
	}

	if !found || automation.GuildId != guildId {
		ctx.JSON(http.StatusNotFound, utils.ErrorStr("Automation not found"))
		return
	}

	if automation.PublishedGraph == nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Automation must be published before submitting to the gallery"))
		return
	}

	triggerKind := ""
	premium := false
	for _, node := range automation.PublishedGraph.Nodes {
		if node.Type == "trigger" {
			triggerKind = node.Kind
			if node.Kind == "cron" || node.Kind == "webhook" {
				premium = true
			}
			break
		}
	}

	if !premium {
		for _, node := range automation.PublishedGraph.Nodes {
			if node.Kind == "http_request" {
				premium = true
				break
			}
		}
	}

	strippedGraph := stripGuildSpecificConfig(*automation.PublishedGraph)
	snapshot := database.GalleryAutomationSnapshot{
		Graph:       strippedGraph,
		TriggerKind: triggerKind,
		Premium:     premium,
	}

	snapshotJSON, err := stdjson.Marshal(snapshot)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to serialise automation snapshot"))
		return
	}

	listing := database.GalleryListing{
		SubmitterUserId: userId,
		SourceGuildId:   guildId,
		ListingType:     database.GalleryListingTypeAutomation,
		Name:            body.Name,
		Description:     body.Description,
		Category:        body.Category,
		Status:          database.GalleryListingStatusPending,
		SnapshotData:    snapshotJSON,
		Title:           "",
		Content:         "",
		Colour:          0,
		ButtonLabel:     "",
	}

	listingId, err := dbclient.Client.GalleryListings.Create(ctx, listing)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create gallery listing"))
		return
	}

	if len(body.Tags) > 0 {
		if err := dbclient.Client.GalleryListingTags.Set(ctx, listingId, body.Tags); err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to save gallery listing tags"))
			return
		}
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionGallerySubmit,
		ResourceType: database.AuditResourceGalleryListing,
		ResourceId:   audit.StringPtr(strconv.Itoa(listingId)),
		NewData: map[string]any{
			"name":          body.Name,
			"category":      body.Category,
			"listing_type":  "automation",
			"automation_id": automationId,
		},
	})

	ctx.JSON(http.StatusOK, gin.H{
		"success":    true,
		"listing_id": listingId,
	})
}

// stripGuildSpecificConfig removes guild-scoped identifiers (channel IDs, user IDs,
// team IDs, etc.) from the snapshot so they are not leaked to other guilds that import
// the automation. The keys are kept with empty values so the import form renders the
// correct input fields and the user can fill in their own values.
func stripGuildSpecificConfig(graph database.AutomationGraph) database.AutomationGraph {
	guildSpecificKeys := map[string]bool{
		"channel_id":     true,
		"user_id":        true,
		"team_id":        true,
		"to_user_id":     true,
		"label_id":       true,
		"tag_id":         true,
		"target_user_id": true,
	}

	stripped := graph
	stripped.Nodes = make([]database.AutomationNode, len(graph.Nodes))
	copy(stripped.Nodes, graph.Nodes)

	for i, node := range stripped.Nodes {
		if node.Config == nil {
			continue
		}
		cleanConfig := make(map[string]any, len(node.Config))
		for k, v := range node.Config {
			if guildSpecificKeys[k] {
				cleanConfig[k] = ""
			} else {
				cleanConfig[k] = v
			}
		}
		stripped.Nodes[i].Config = cleanConfig
	}

	return stripped
}
