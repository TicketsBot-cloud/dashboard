package kb

import (
	"fmt"
	"strconv"

	gdlcache "github.com/TicketsBot-cloud/gdl/cache"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

// parsePublicGuildId extracts and validates the guild ID from the URL parameter.
// Returns the parsed ID and true on success, or writes a 400 response and returns false.
func parsePublicGuildId(ctx *gin.Context) (uint64, bool) {
	raw := ctx.Param("guildId")
	guildId, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid guild ID format"))
		return 0, false
	}
	return guildId, true
}

type publicGuildInfoResponse struct {
	GuildId string `json:"guild_id"`
	Name    string `json:"name"`
	IconUrl string `json:"icon_url"`
}

// PublicGuildInfoHandler returns basic guild information for the public knowledge base.
// GET /api/kb/public/:guildId/info
func PublicGuildInfoHandler(ctx *gin.Context) {
	guildId, ok := parsePublicGuildId(ctx)
	if !ok {
		return
	}

	g, err := cache.Instance.GetGuild(ctx, guildId)
	if err != nil {
		if err == gdlcache.ErrNotFound {
			ctx.JSON(404, utils.ErrorStr("Guild not found"))
			return
		}
		ctx.JSON(500, utils.ErrorStr("Failed to fetch guild information"))
		return
	}

	var iconUrl string
	if g.Icon != "" {
		iconUrl = fmt.Sprintf("https://cdn.discordapp.com/icons/%d/%s.png", guildId, g.Icon)
	}

	ctx.JSON(200, publicGuildInfoResponse{
		GuildId: strconv.FormatUint(guildId, 10),
		Name:    g.Name,
		IconUrl: iconUrl,
	})
}

// PublicListArticlesHandler returns all published articles for a guild.
// GET /api/kb/public/:guildId/articles
func PublicListArticlesHandler(ctx *gin.Context) {
	guildId, ok := parsePublicGuildId(ctx)
	if !ok {
		return
	}

	articles, err := dbclient.Client.KBArticles.GetByGuild(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch knowledge base articles"))
		return
	}

	// Filter to only published articles
	published := make([]database.KBArticle, 0)
	for _, a := range articles {
		if a.Published {
			published = append(published, a)
		}
	}

	ctx.JSON(200, published)
}

// PublicGetArticleBySlugHandler returns a single published article by its slug.
// GET /api/kb/public/:guildId/articles/:slug
func PublicGetArticleBySlugHandler(ctx *gin.Context) {
	guildId, ok := parsePublicGuildId(ctx)
	if !ok {
		return
	}

	slug := ctx.Param("slug")
	if slug == "" {
		ctx.JSON(400, utils.ErrorStr("Article slug is required"))
		return
	}

	article, found, err := dbclient.Client.KBArticles.GetBySlug(ctx, guildId, slug)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch knowledge base article"))
		return
	}

	if !found {
		ctx.JSON(404, utils.ErrorStr("Article not found"))
		return
	}

	ctx.JSON(200, article)
}

// PublicListCategoriesHandler returns all knowledge base categories for a guild.
// GET /api/kb/public/:guildId/categories
func PublicListCategoriesHandler(ctx *gin.Context) {
	guildId, ok := parsePublicGuildId(ctx)
	if !ok {
		return
	}

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

// PublicSearchHandler performs a full-text search across published articles.
// GET /api/kb/public/:guildId/search?q=...
func PublicSearchHandler(ctx *gin.Context) {
	guildId, ok := parsePublicGuildId(ctx)
	if !ok {
		return
	}

	q := ctx.Query("q")
	if q == "" {
		ctx.JSON(200, make([]database.KBArticle, 0))
		return
	}

	results, err := dbclient.Client.KBArticles.Search(ctx, guildId, q, 20)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to search knowledge base articles"))
		return
	}

	if results == nil {
		results = make([]database.KBArticle, 0)
	}

	ctx.JSON(200, results)
}
