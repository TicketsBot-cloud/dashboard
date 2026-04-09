package kb

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

const freeCategoryLimit = 3

type categoryRequest struct {
	Name     string  `json:"name"`
	Emoji    *string `json:"emoji"`
	Position int     `json:"position"`
}

// ListCategoriesHandler returns all knowledge base categories for the guild.
func ListCategoriesHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	categories, err := dbclient.Client.KBCategories.GetByGuild(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch knowledge base categories"))
		return
	}

	if categories == nil {
		categories = make([]database.KBCategory, 0)
	}

	ctx.JSON(200, categories)
}

// CreateCategoryHandler creates a new knowledge base category.
func CreateCategoryHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	var body categoryRequest
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if err := validateCategoryRequest(body); err != nil {
		ctx.JSON(400, utils.ErrorStr("%s", err.Error()))
		return
	}

	// Check freemium category limit
	botCtx, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, false, botCtx.Token, botCtx.RateLimiter)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to verify premium status. Please try again."))
		return
	}

	if premiumTier == premium.None {
		existing, err := dbclient.Client.KBCategories.GetByGuild(ctx, guildId)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to check category quota"))
			return
		}

		if len(existing) >= freeCategoryLimit {
			ctx.JSON(402, utils.ErrorStr("Category quota exceeded: you have %d/%d categories. Purchase premium to unlock more.", len(existing), freeCategoryLimit))
			return
		}
	}

	category := database.KBCategory{
		GuildId:  guildId,
		Name:     body.Name,
		Emoji:    body.Emoji,
		Position: body.Position,
	}

	categoryId, err := dbclient.Client.KBCategories.Create(ctx, category)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to create knowledge base category"))
		return
	}

	category.Id = categoryId

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionKBCategoryCreate,
		ResourceType: database.AuditResourceKBCategory,
		ResourceId:   audit.StringPtr(strconv.Itoa(categoryId)),
		NewData:      body,
	})

	ctx.JSON(201, category)
}

// UpdateCategoryHandler updates an existing knowledge base category.
func UpdateCategoryHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	catId, err := strconv.Atoi(ctx.Param("catId"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid category ID"))
		return
	}

	existing, found, err := dbclient.Client.KBCategories.Get(ctx, catId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch knowledge base category"))
		return
	}

	if !found || existing.GuildId != guildId {
		ctx.JSON(404, utils.ErrorStr("Category not found"))
		return
	}

	var body categoryRequest
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if err := validateCategoryRequest(body); err != nil {
		ctx.JSON(400, utils.ErrorStr("%s", err.Error()))
		return
	}

	updated := database.KBCategory{
		Id:       catId,
		GuildId:  guildId,
		Name:     body.Name,
		Emoji:    body.Emoji,
		Position: body.Position,
	}

	if err := dbclient.Client.KBCategories.Update(ctx, updated); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to update knowledge base category"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionKBCategoryUpdate,
		ResourceType: database.AuditResourceKBCategory,
		ResourceId:   audit.StringPtr(strconv.Itoa(catId)),
		OldData:      existing,
		NewData:      body,
	})

	ctx.JSON(200, updated)
}

// DeleteCategoryHandler deletes a knowledge base category.
func DeleteCategoryHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	catId, err := strconv.Atoi(ctx.Param("catId"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid category ID"))
		return
	}

	existing, found, err := dbclient.Client.KBCategories.Get(ctx, catId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch knowledge base category"))
		return
	}

	if !found || existing.GuildId != guildId {
		ctx.JSON(404, utils.ErrorStr("Category not found"))
		return
	}

	if err := dbclient.Client.KBCategories.Delete(ctx, guildId, catId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete knowledge base category"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionKBCategoryDelete,
		ResourceType: database.AuditResourceKBCategory,
		ResourceId:   audit.StringPtr(strconv.Itoa(catId)),
		OldData:      existing,
	})

	ctx.Status(204)
}

func validateCategoryRequest(body categoryRequest) error {
	if len(strings.TrimSpace(body.Name)) == 0 {
		return fmt.Errorf("name is required")
	}

	if len(body.Name) > 50 {
		return fmt.Errorf("name must be 50 characters or fewer")
	}

	if body.Emoji != nil && len(*body.Emoji) > 64 {
		return fmt.Errorf("emoji must be 64 characters or fewer")
	}

	return nil
}
