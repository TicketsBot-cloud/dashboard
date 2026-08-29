package kb

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"github.com/ticketsbot-cloud/dashboard/backend/utils/types"
)

const freeArticleLimit = 5

var slugStripRegex = regexp.MustCompile(`[^a-z0-9-]+`)

type articleRequest struct {
	Title            string             `json:"title"`
	Description      *string            `json:"description"`
	Content          *string            `json:"content"`
	Embed            *types.CustomEmbed `json:"embed"`
	CategoryIds      []int              `json:"category_ids"`
	Keywords         []string           `json:"keywords"`
	Position         *int               `json:"position"`
	Published        *bool              `json:"published"`
	ShowHelpfulCount *bool              `json:"show_helpful_count"`
}

// ListArticlesHandler returns all articles for the guild.
func ListArticlesHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	articles, err := dbclient.Client.KBArticles.GetByGuild(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch knowledge base articles"))
		return
	}

	if articles == nil {
		articles = make([]database.KBArticle, 0)
	}

	ctx.JSON(200, articles)
}

// GetArticleHandler returns a single article by ID.
func GetArticleHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	articleId, err := strconv.Atoi(ctx.Param("articleId"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid article ID"))
		return
	}

	article, found, err := dbclient.Client.KBArticles.Get(ctx, articleId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch knowledge base article"))
		return
	}

	if !found || article.GuildId != guildId {
		ctx.JSON(404, utils.ErrorStr("Article not found"))
		return
	}

	ctx.JSON(200, article)
}

// CreateArticleHandler creates a new knowledge base article.
func CreateArticleHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	var body articleRequest
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if err := validateArticleRequest(body); err != nil {
		ctx.JSON(400, utils.ErrorStr("%s", err.Error()))
		return
	}

	// Check freemium limit
	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, false, botContext.Token, botContext.RateLimiter)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to verify premium status. Please try again."))
		return
	}

	if premiumTier == premium.None {
		count, err := dbclient.Client.KBArticles.GetCountByGuild(ctx, guildId)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to check article quota"))
			return
		}

		if count >= freeArticleLimit {
			ctx.JSON(402, utils.ErrorStr("Article quota exceeded: you have %d/%d articles. Purchase premium to unlock more.", count, freeArticleLimit))
			return
		}
	}

	if err := cleanAndValidateEmbed(body.Embed); err != nil {
		ctx.JSON(400, utils.ErrorStr("%s", err.Error()))
		return
	}

	slug := generateSlug(body.Title)

	var embed *database.CustomEmbedWithFields
	if body.Embed != nil {
		customEmbed, fields := body.Embed.IntoDatabaseStruct()
		embed = &database.CustomEmbedWithFields{
			CustomEmbed: customEmbed,
			Fields:      fields,
		}
	}

	published := true
	if body.Published != nil {
		published = *body.Published
	}

	showHelpfulCount := false
	if body.ShowHelpfulCount != nil {
		showHelpfulCount = *body.ShowHelpfulCount
	}

	position := 0
	if body.Position != nil {
		position = *body.Position
	} else {
		count, err := dbclient.Client.KBArticles.GetCountByGuild(ctx, guildId)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to determine article position"))
			return
		}
		position = count
	}

	if body.CategoryIds == nil {
		body.CategoryIds = make([]int, 0)
	}

	if body.Keywords == nil {
		body.Keywords = make([]string, 0)
	}

	article := database.KBArticle{
		GuildId:          guildId,
		Title:            body.Title,
		Slug:             slug,
		Description:      body.Description,
		Content:          body.Content,
		Embed:            embed,
		CategoryIds:      body.CategoryIds,
		Keywords:         body.Keywords,
		Position:         position,
		Published:        published,
		ShowHelpfulCount: showHelpfulCount,
	}

	articleId, err := dbclient.Client.KBArticles.Create(ctx, article)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to create knowledge base article"))
		return
	}

	article.Id = articleId

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionKBArticleCreate,
		ResourceType: database.AuditResourceKBArticle,
		ResourceId:   audit.StringPtr(strconv.Itoa(articleId)),
		NewData:      body,
	})

	ctx.JSON(201, article)
}

// UpdateArticleHandler updates an existing knowledge base article.
func UpdateArticleHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	articleId, err := strconv.Atoi(ctx.Param("articleId"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid article ID"))
		return
	}

	existing, found, err := dbclient.Client.KBArticles.Get(ctx, articleId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch knowledge base article"))
		return
	}

	if !found || existing.GuildId != guildId {
		ctx.JSON(404, utils.ErrorStr("Article not found"))
		return
	}

	var body articleRequest
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if err := validateArticleRequest(body); err != nil {
		ctx.JSON(400, utils.ErrorStr("%s", err.Error()))
		return
	}

	if err := cleanAndValidateEmbed(body.Embed); err != nil {
		ctx.JSON(400, utils.ErrorStr("%s", err.Error()))
		return
	}

	slug := generateSlug(body.Title)

	var embed *database.CustomEmbedWithFields
	if body.Embed != nil {
		customEmbed, fields := body.Embed.IntoDatabaseStruct()
		embed = &database.CustomEmbedWithFields{
			CustomEmbed: customEmbed,
			Fields:      fields,
		}
	}

	published := existing.Published
	if body.Published != nil {
		published = *body.Published
	}

	showHelpfulCount := existing.ShowHelpfulCount
	if body.ShowHelpfulCount != nil {
		showHelpfulCount = *body.ShowHelpfulCount
	}

	position := existing.Position
	if body.Position != nil {
		position = *body.Position
	}

	if body.CategoryIds == nil {
		body.CategoryIds = make([]int, 0)
	}

	if body.Keywords == nil {
		body.Keywords = make([]string, 0)
	}

	updated := database.KBArticle{
		Id:               articleId,
		GuildId:          guildId,
		Title:            body.Title,
		Slug:             slug,
		Description:      body.Description,
		Content:          body.Content,
		Embed:            embed,
		CategoryIds:      body.CategoryIds,
		Keywords:         body.Keywords,
		Position:         position,
		Published:        published,
		ShowHelpfulCount: showHelpfulCount,
	}

	if err := dbclient.Client.KBArticles.Update(ctx, updated); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to update knowledge base article"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionKBArticleUpdate,
		ResourceType: database.AuditResourceKBArticle,
		ResourceId:   audit.StringPtr(strconv.Itoa(articleId)),
		OldData:      existing,
		NewData:      body,
	})

	ctx.JSON(200, updated)
}

type articleOrderRequest struct {
	ArticleIds []int `json:"article_ids"`
}

// ReorderArticlesHandler assigns positions from the given order.
func ReorderArticlesHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	var body articleOrderRequest
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if len(body.ArticleIds) == 0 {
		ctx.JSON(400, utils.ErrorStr("No articles provided"))
		return
	}

	seen := make(map[int]struct{}, len(body.ArticleIds))
	for _, id := range body.ArticleIds {
		if _, duplicate := seen[id]; duplicate {
			ctx.JSON(400, utils.ErrorStr("Duplicate article in order"))
			return
		}
		seen[id] = struct{}{}
	}

	if err := dbclient.Client.KBArticles.SetPositions(ctx, guildId, body.ArticleIds); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to reorder knowledge base articles"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionKBArticleUpdate,
		ResourceType: database.AuditResourceKBArticle,
		NewData:      body,
	})

	ctx.JSON(200, gin.H{"success": true})
}

// DeleteArticleHandler deletes a knowledge base article.
func DeleteArticleHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	articleId, err := strconv.Atoi(ctx.Param("articleId"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid article ID"))
		return
	}

	existing, found, err := dbclient.Client.KBArticles.Get(ctx, articleId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch knowledge base article"))
		return
	}

	if !found || existing.GuildId != guildId {
		ctx.JSON(404, utils.ErrorStr("Article not found"))
		return
	}

	if err := dbclient.Client.KBArticles.Delete(ctx, guildId, articleId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete knowledge base article"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionKBArticleDelete,
		ResourceType: database.AuditResourceKBArticle,
		ResourceId:   audit.StringPtr(strconv.Itoa(articleId)),
		OldData:      existing,
	})

	ctx.Status(204)
}

func validateArticleRequest(body articleRequest) error {
	if len(strings.TrimSpace(body.Title)) == 0 {
		return fmt.Errorf("title is required")
	}

	if len(body.Title) > 100 {
		return fmt.Errorf("title must be 100 characters or fewer")
	}

	if body.Description != nil && len(*body.Description) > 255 {
		return fmt.Errorf("description must be 255 characters or fewer")
	}

	if body.Content != nil && len(*body.Content) > 4096 {
		return fmt.Errorf("content must be 4096 characters or fewer")
	}

	if body.Content == nil && body.Embed == nil {
		return fmt.Errorf("you must provide either content or an embed for the article")
	}

	if len(body.CategoryIds) > 10 {
		return fmt.Errorf("an article may belong to at most 10 categories")
	}

	if len(body.Keywords) > 25 {
		return fmt.Errorf("an article may have at most 25 keywords")
	}

	for _, kw := range body.Keywords {
		if len(kw) > 50 {
			return fmt.Errorf("each keyword must be 50 characters or fewer")
		}
	}

	return nil
}

func generateSlug(title string) string {
	slug := strings.ToLower(title)
	slug = strings.ReplaceAll(slug, " ", "-")
	slug = slugStripRegex.ReplaceAllString(slug, "")

	// Collapse consecutive hyphens
	for strings.Contains(slug, "--") {
		slug = strings.ReplaceAll(slug, "--", "-")
	}

	slug = strings.Trim(slug, "-")

	if len(slug) > 100 {
		slug = slug[:100]
		slug = strings.TrimRight(slug, "-")
	}

	if slug == "" {
		slug = "article"
	}

	return slug
}

var validate = validator.New()

// Cleans first so the min=1 tags do not reject fields submitted as "".
func cleanAndValidateEmbed(embed *types.CustomEmbed) error {
	if embed == nil {
		return nil
	}

	cleanEmbedFields(embed)

	if err := validate.Struct(embed); err != nil {
		var validationErrors validator.ValidationErrors
		if !errors.As(err, &validationErrors) {
			return err
		}

		return fmt.Errorf("your embed contained the following errors:\n%s", utils.FormatValidationErrors(validationErrors))
	}

	if total := embed.TotalCharacterCount(); total > types.EmbedTotalCharacterLimit {
		return fmt.Errorf("total embed characters (%d) exceeds Discord's %d character limit", total, types.EmbedTotalCharacterLimit)
	}

	return nil
}

// cleanEmbedFields converts empty strings to nil for optional embed fields.
func cleanEmbedFields(embed *types.CustomEmbed) {
	if embed.Title != nil && *embed.Title == "" {
		embed.Title = nil
	}
	if embed.Description != nil && *embed.Description == "" {
		embed.Description = nil
	}
	if embed.Url != nil && *embed.Url == "" {
		embed.Url = nil
	}
	if embed.ImageUrl != nil && *embed.ImageUrl == "" {
		embed.ImageUrl = nil
	}
	if embed.ThumbnailUrl != nil && *embed.ThumbnailUrl == "" {
		embed.ThumbnailUrl = nil
	}

	if embed.Author.Name != nil && *embed.Author.Name == "" {
		embed.Author.Name = nil
	}
	if embed.Author.IconUrl != nil && *embed.Author.IconUrl == "" {
		embed.Author.IconUrl = nil
	}
	if embed.Author.Url != nil && *embed.Author.Url == "" {
		embed.Author.Url = nil
	}

	if embed.Footer.Text != nil && *embed.Footer.Text == "" {
		embed.Footer.Text = nil
	}
	if embed.Footer.IconUrl != nil && *embed.Footer.IconUrl == "" {
		embed.Footer.IconUrl = nil
	}
}
