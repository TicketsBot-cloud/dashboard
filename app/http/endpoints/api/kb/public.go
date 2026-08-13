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

type kbCustomisationResponse struct {
	PrimaryBg    *string `json:"primary_bg,omitempty"`
	CardBg       *string `json:"card_bg,omitempty"`
	TextColour   *string `json:"text_colour,omitempty"`
	AccentColour *string `json:"accent_colour,omitempty"`
	LogoUrl      *string `json:"logo_url,omitempty"`
	HideBranding bool    `json:"hide_branding"`
}

func colourToHex(v *int) *string {
	if v == nil {
		return nil
	}
	s := fmt.Sprintf("#%06X", *v)
	return &s
}

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
	GuildId       string                   `json:"guild_id"`
	Name          string                   `json:"name"`
	IconUrl       string                   `json:"icon_url"`
	Customisation *kbCustomisationResponse `json:"customisation,omitempty"`
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

	response := publicGuildInfoResponse{
		GuildId: strconv.FormatUint(guildId, 10),
		Name:    g.Name,
		IconUrl: iconUrl,
	}

	kbSettings, found, err := dbclient.Client.KBSettings.Get(ctx, guildId)
	if err == nil && found {
		response.Customisation = &kbCustomisationResponse{
			PrimaryBg:    colourToHex(kbSettings.PrimaryBg),
			CardBg:       colourToHex(kbSettings.CardBg),
			TextColour:   colourToHex(kbSettings.TextColour),
			AccentColour: colourToHex(kbSettings.AccentColour),
			LogoUrl:      kbSettings.LogoUrl,
			HideBranding: kbSettings.HideBranding,
		}
	}

	ctx.JSON(200, response)
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
	published := make([]publicArticleResponse, 0)
	for _, a := range articles {
		if a.Published {
			published = append(published, toPublicArticle(a))
		}
	}

	ctx.JSON(200, published)
}

// These pointers shadow the embedded counters, so a nil omits the key entirely.
// NotHelpfulCount is always nil: the dislike tally stays internal.
type publicArticleResponse struct {
	database.KBArticle
	HelpfulCount    *int `json:"helpful_count,omitempty"`
	NotHelpfulCount *int `json:"not_helpful_count,omitempty"`
}

func toPublicArticle(article database.KBArticle) publicArticleResponse {
	res := publicArticleResponse{KBArticle: article}
	if article.ShowHelpfulCount {
		count := article.HelpfulCount
		res.HelpfulCount = &count
	}
	return res
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

	ctx.JSON(200, toPublicArticle(article))
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
		ctx.JSON(200, make([]publicArticleResponse, 0))
		return
	}

	results, err := dbclient.Client.KBArticles.Search(ctx, guildId, q, 20)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to search knowledge base articles"))
		return
	}

	public := make([]publicArticleResponse, 0, len(results))
	for _, a := range results {
		public = append(public, toPublicArticle(a))
	}

	ctx.JSON(200, public)
}

type publicArticleFeedbackRequest struct {
	// Pointer so a missing field does not read as a downvote.
	Helpful *bool `json:"helpful"`
}

// PublicArticleFeedbackHandler records a web visitor's helpfulness vote for an article.
// POST /api/kb/public/:guildId/articles/:slug/feedback
func PublicArticleFeedbackHandler(ctx *gin.Context) {
	guildId, ok := parsePublicGuildId(ctx)
	if !ok {
		return
	}

	slug := ctx.Param("slug")
	if slug == "" {
		ctx.JSON(400, utils.ErrorStr("Article slug is required"))
		return
	}

	var body publicArticleFeedbackRequest
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	if body.Helpful == nil {
		ctx.JSON(400, utils.ErrorStr("A vote is required"))
		return
	}

	article, found, err := dbclient.Client.KBArticles.GetBySlug(ctx, guildId, slug)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch knowledge base article"))
		return
	}

	if !found || !article.Published {
		ctx.JSON(404, utils.ErrorStr("Article not found"))
		return
	}

	if err := dbclient.Client.KBArticles.IncrementFeedback(ctx, guildId, article.Id, *body.Helpful); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to record article feedback"))
		return
	}

	ctx.JSON(200, gin.H{"success": true})
}
