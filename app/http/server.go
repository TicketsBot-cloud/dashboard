package http

import (
	nethttp "net/http"
	"time"

	"github.com/TicketsBot-cloud/common/permission"
	"github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api"
	"github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/admin/botstaff"
	admin_entitlements "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/admin/entitlements"
	admin_globalblacklist "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/admin/globalblacklist"
	admin_polarproducts "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/admin/polarproducts"
	admin_premiumkeys "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/admin/premiumkeys"
	admin_serverblacklist "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/admin/serverblacklist"
	admin_skus "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/admin/skus"
	admin_gallery "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/admin/gallery"
	admin_integrations "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/admin/integrations"
	api_analytics "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/analytics"
	api_audit "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/auditlog"
	api_blacklist "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/blacklist"
	api_forms "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/forms"
	api_gallery "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/gallery"
	api_integrations "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/integrations"
	api_kb "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/kb"
	api_panels "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/panel"
	api_polar "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/polar"
	api_premium "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/premium"
	api_settings "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/settings"
	api_override "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/staffoverride"
	api_tags "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/tags"
	api_team "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/team"
	api_ticket "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/ticket"
	"github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/ticket/livechat"
	api_transcripts "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/transcripts"
	api_whitelabel "github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/whitelabel"
	"github.com/TicketsBot-cloud/dashboard/app/http/endpoints/root"
	"github.com/TicketsBot-cloud/dashboard/app/http/middleware"
	"github.com/TicketsBot-cloud/dashboard/app/http/session"
	"github.com/TicketsBot-cloud/dashboard/config"
	sentrygin "github.com/getsentry/sentry-go/gin"
	"github.com/gin-gonic/gin"
	"github.com/penglongli/gin-metrics/ginmetrics"
	"go.uber.org/zap"
)

func StartServer(logger *zap.Logger, sm *livechat.SocketManager) *nethttp.Server {
	logger.Info("Starting HTTP server")

	router := gin.New()
	router.Use(sentrygin.New(sentrygin.Options{}))
	router.Use(gin.Recovery())
	router.Use(middleware.Logging(logger))
	router.Use(middleware.ErrorHandler)

	router.RemoteIPHeaders = config.Conf.Server.RealIpHeaders
	if err := router.SetTrustedProxies(config.Conf.Server.TrustedProxies); err != nil {
		panic(err)
	}

	// Sessions
	session.Store = session.NewRedisStore()

	router.Use(rl(middleware.RateLimitTypeIp, 60, time.Minute))
	router.Use(rl(middleware.RateLimitTypeIp, 20, time.Second*10))
	router.Use(rl(middleware.RateLimitTypeUser, 60, time.Minute))
	router.Use(rl(middleware.RateLimitTypeGuild, 600, time.Minute*5))

	router.Use(middleware.Cors(config.Conf))

	// Metrics
	if len(config.Conf.Server.MetricHost) > 0 {
		monitor := ginmetrics.GetMonitor()
		monitor.UseWithoutExposingEndpoint(router)
		monitor.SetMetricPath("/metrics")

		metricRouter := gin.New()
		metricRouter.Use(gin.Recovery())
		metricRouter.Use(middleware.Logging(logger))

		monitor.Expose(metricRouter)

		go func() {
			if err := metricRouter.Run(config.Conf.Server.MetricHost); err != nil {
				panic(err)
			}
		}()
	}

	// util endpoints
	router.GET("/ip", root.IpHandler)
	router.GET("/robots.txt", func(ctx *gin.Context) {
		ctx.String(200, "Disallow: /")
	})

	router.POST("/callback", middleware.VerifyXTicketsHeader, root.CallbackHandler)
	router.POST("/logout", middleware.VerifyXTicketsHeader, middleware.AuthenticateToken, root.LogoutHandler)

	// Public KB routes — no authentication required
	kbPublic := router.Group("/api/kb/public/:guildId",
		rl(middleware.RateLimitTypeIp, 30, time.Minute),
		rl(middleware.RateLimitTypeIp, 10, time.Second*10),
	)
	{
		kbPublic.GET("/info", api_kb.PublicGuildInfoHandler)
		kbPublic.GET("/articles", api_kb.PublicListArticlesHandler)
		kbPublic.GET("/articles/:slug", api_kb.PublicGetArticleBySlugHandler)
		kbPublic.GET("/categories", api_kb.PublicListCategoriesHandler)
		kbPublic.GET("/search", api_kb.PublicSearchHandler)
	}

	apiGroup := router.Group("/api", middleware.VerifyXTicketsHeader, middleware.AuthenticateToken, middleware.SentryUser, middleware.UpdateLastSeen)
	{
		{
			integrationGroup := apiGroup.Group("/integrations")

			integrationGroup.GET("/self", api_integrations.GetOwnedIntegrationsHandler)
			integrationGroup.GET("/view/:integrationid", api_integrations.GetIntegrationHandler)
			integrationGroup.GET("/view/:integrationid/detail", api_integrations.GetIntegrationDetailedHandler)
			integrationGroup.POST("/:integrationid/public", api_integrations.SetIntegrationPublicHandler)
			integrationGroup.PATCH("/:integrationid", api_integrations.UpdateIntegrationHandler)
			integrationGroup.DELETE("/:integrationid", api_integrations.DeleteIntegrationHandler)
			apiGroup.POST("/integrations", api_integrations.CreateIntegrationHandler)
		}

		// Public gallery routes (authenticated but no guild context)
		apiGroup.GET("/gallery", api_gallery.BrowseHandler)
		apiGroup.GET("/gallery/:id", api_gallery.GetHandler)

		apiGroup.GET("/premium/products", api_polar.GetProducts)

		{
			premiumGroup := apiGroup.Group("/premium/@me")
			premiumGroup.GET("/entitlements", api_premium.GetEntitlements)
			premiumGroup.PUT("/active-guilds", api_premium.SetActiveGuilds)

			{
				polarGroup := premiumGroup.Group("/polar")
				polarGroup.POST("/checkout",
					rl(middleware.RateLimitTypeUser, 5, time.Minute),
					api_polar.CreateCheckout,
				)
				polarGroup.GET("/subscriptions", api_polar.GetSubscriptions)
				polarGroup.POST("/subscriptions/:subid/cancel",
					rl(middleware.RateLimitTypeUser, 3, time.Minute),
					api_polar.CancelSubscription,
				)
				polarGroup.POST("/subscriptions/:subid/uncancel",
					rl(middleware.RateLimitTypeUser, 3, time.Minute),
					api_polar.UncancelSubscription,
				)
				polarGroup.POST("/subscriptions/:subid/change",
					rl(middleware.RateLimitTypeUser, 3, time.Minute),
					api_polar.ChangeSubscription,
				)
				polarGroup.GET("/orders", api_polar.GetOrders)
				polarGroup.GET("/orders/:orderid/invoice",
					rl(middleware.RateLimitTypeUser, 10, time.Minute),
					api_polar.GetOrderInvoice,
				)
			}
		}
	}

	guildAuthApiAdmin := apiGroup.Group("/:id", middleware.AuthenticateGuild(permission.Admin), middleware.SentryUser)
	guildAuthApiSupport := apiGroup.Group("/:id", middleware.AuthenticateGuild(permission.Support), middleware.SentryUser)
	guildApiNoAuth := apiGroup.Group("/:id", middleware.ParseGuildId, middleware.SentryUser)
	{
		guildAuthApiSupport.GET("/guild", api.GuildHandler)
		guildAuthApiSupport.GET("/channels", api.ChannelsHandler)
		guildAuthApiSupport.GET("/premium", api.PremiumHandler)
		guildAuthApiSupport.GET("/user/:user", api.UserHandler)
		guildAuthApiSupport.GET("/roles", api.RolesHandler)
		guildAuthApiSupport.GET("/emojis", rl(middleware.RateLimitTypeGuild, 5, time.Second*30), api.EmojisHandler)
		guildAuthApiSupport.GET("/members/search",
			rl(middleware.RateLimitTypeGuild, 5, time.Second),
			rl(middleware.RateLimitTypeGuild, 10, time.Second*30),
			rl(middleware.RateLimitTypeGuild, 75, time.Minute*30),
			api.SearchMembers,
		)

		// Must be readable to load transcripts page
		guildAuthApiSupport.GET("/settings", api_settings.GetSettingsHandler)
		guildAuthApiAdmin.POST("/settings", api_settings.UpdateSettingsHandler)

		guildAuthApiSupport.GET("/blacklist", api_blacklist.GetBlacklistHandler)
		guildAuthApiSupport.POST("/blacklist", api_blacklist.AddBlacklistHandler)
		guildAuthApiSupport.DELETE("/blacklist/user/:user", api_blacklist.RemoveUserBlacklistHandler)
		guildAuthApiSupport.DELETE("/blacklist/role/:role", api_blacklist.RemoveRoleBlacklistHandler)

		// Must be readable to load transcripts page
		guildAuthApiSupport.GET("/panels", api_panels.ListPanels)
		guildAuthApiSupport.GET("/panels/:panelid", api_panels.GetPanel)
		guildAuthApiAdmin.GET("/panels/permcheck", api_panels.PermCheckHandler)
		guildAuthApiAdmin.POST("/panels", api_panels.CreatePanel)
		guildAuthApiAdmin.POST("/panels/:panelid", rl(middleware.RateLimitTypeGuild, 5, 5*time.Second), api_panels.ResendPanel)
		guildAuthApiAdmin.PATCH("/panels/:panelid", api_panels.UpdatePanel)
		guildAuthApiAdmin.DELETE("/panels/:panelid", api_panels.DeletePanel)

		guildAuthApiAdmin.DELETE("/panels/:panelid/cooldowns", api_panels.ResetPanelCooldowns)

		// Support hours endpoints
		guildAuthApiSupport.GET("/panels/:panelid/support-hours", api_panels.GetSupportHours)
		guildAuthApiAdmin.POST("/panels/:panelid/support-hours", api_panels.SetSupportHours)
		guildAuthApiAdmin.DELETE("/panels/:panelid/support-hours", api_panels.DeleteSupportHours)
		guildAuthApiSupport.GET("/panels/:panelid/is-active", api_panels.IsPanelActive)

		guildAuthApiAdmin.GET("/multipanels", api_panels.MultiPanelList)
		guildAuthApiAdmin.GET("/multipanels/:panelid", api_panels.MultiPanelGet)
		guildAuthApiAdmin.POST("/multipanels", api_panels.MultiPanelCreate)
		guildAuthApiAdmin.POST("/multipanels/:panelid", rl(middleware.RateLimitTypeGuild, 5, 5*time.Second), api_panels.MultiPanelResend)
		guildAuthApiAdmin.PATCH("/multipanels/:panelid", api_panels.MultiPanelUpdate)
		guildAuthApiAdmin.DELETE("/multipanels/:panelid", api_panels.MultiPanelDelete)

		guildAuthApiSupport.GET("/forms", api_forms.GetForms)
		guildAuthApiAdmin.POST("/forms", rl(middleware.RateLimitTypeGuild, 30, time.Hour), api_forms.CreateForm)
		guildAuthApiAdmin.PATCH("/forms/:form_id", rl(middleware.RateLimitTypeGuild, 30, time.Hour), api_forms.UpdateForm)
		guildAuthApiAdmin.DELETE("/forms/:form_id", api_forms.DeleteForm)
		guildAuthApiAdmin.PATCH("/forms/:form_id/inputs", api_forms.UpdateInputs)

		// Should be a GET, but easier to take a body for development purposes
		guildAuthApiSupport.POST("/transcripts",
			rl(middleware.RateLimitTypeUser, 5, 5*time.Second),
			rl(middleware.RateLimitTypeUser, 20, time.Minute),
			api_transcripts.ListTranscripts,
		)

		// Allow regular users to get their own transcripts, make sure you check perms inside
		guildApiNoAuth.GET("/transcripts/:ticketId", rl(middleware.RateLimitTypeGuild, 10, 10*time.Second), api_transcripts.GetTranscriptHandler)
		guildApiNoAuth.GET("/transcripts/:ticketId/render", rl(middleware.RateLimitTypeGuild, 10, 10*time.Second), api_transcripts.GetTranscriptRenderHandler)

		// Ticket label CRUD (admin-only for mutations, support-level for reads)
		guildAuthApiSupport.GET("/ticket-labels", api_ticket.ListTicketLabels)
		guildAuthApiAdmin.POST("/ticket-labels", rl(middleware.RateLimitTypeGuild, 10, time.Minute), api_ticket.CreateTicketLabel)
		guildAuthApiAdmin.PATCH("/ticket-labels/:labelid", api_ticket.UpdateTicketLabel)
		guildAuthApiAdmin.DELETE("/ticket-labels/:labelid", api_ticket.DeleteTicketLabel)

		// Ticket label assignments - support level
		guildAuthApiSupport.GET("/tickets/:ticketId/labels", api_ticket.GetTicketLabels)
		guildAuthApiSupport.PUT("/tickets/:ticketId/labels", api_ticket.SetTicketLabels)
		guildAuthApiSupport.DELETE("/tickets/:ticketId/labels/:labelid", api_ticket.RemoveTicketLabel)

		guildAuthApiSupport.GET("/tickets", api_ticket.GetTickets)
		guildAuthApiSupport.POST("/tickets", api_ticket.GetTickets)
		guildAuthApiSupport.GET("/tickets/:ticketId", api_ticket.GetTicket)
		guildAuthApiSupport.POST("/tickets/:ticketId", rl(middleware.RateLimitTypeGuild, 5, time.Second*5), api_ticket.SendMessage)
		guildAuthApiSupport.POST("/tickets/:ticketId/tag", rl(middleware.RateLimitTypeGuild, 5, time.Second*5), api_ticket.SendTag)
		guildAuthApiSupport.GET("/tickets/:ticketId/members", api_ticket.GetTicketMembers)
		guildAuthApiSupport.DELETE("/tickets/:ticketId", api_ticket.CloseTicket)
		guildAuthApiSupport.POST("/tickets/:ticketId/close-request", api_ticket.CloseRequest)
		guildAuthApiSupport.POST("/tickets/bulk-close", rl(middleware.RateLimitTypeGuild, 5, time.Minute), api_ticket.BulkCloseTickets)
		guildAuthApiSupport.POST("/tickets/bulk-close-request", rl(middleware.RateLimitTypeGuild, 5, time.Minute), api_ticket.BulkCloseRequest)
		guildAuthApiSupport.POST("/tickets/bulk-send-message", rl(middleware.RateLimitTypeGuild, 5, time.Minute), api_ticket.BulkSendMessage)
		guildAuthApiSupport.POST("/tickets/bulk-send-tag", rl(middleware.RateLimitTypeGuild, 5, time.Minute), api_ticket.BulkSendTag)
		guildAuthApiSupport.PATCH("/tickets/:ticketId/close-reason", api_ticket.UpdateCloseReason)

		// Websockets do not support headers: so we must implement authentication over the WS connection
		router.GET("/api/:id/tickets/:ticketId/live-chat", livechat.GetLiveChatHandler(sm))

		guildAuthApiSupport.GET("/tags", api_tags.TagsListHandler)
		guildAuthApiSupport.PUT("/tags", api_tags.CreateTag)
		guildAuthApiSupport.DELETE("/tags", api_tags.DeleteTag)

		guildAuthApiAdmin.GET("/team", api_team.GetTeams)
		guildAuthApiAdmin.GET("/team/:teamid", rl(middleware.RateLimitTypeUser, 10, time.Second*30), api_team.GetMembers)
		guildAuthApiAdmin.POST("/team", rl(middleware.RateLimitTypeUser, 10, time.Minute), api_team.CreateTeam)
		guildAuthApiAdmin.PUT("/team/:teamid/:snowflake", rl(middleware.RateLimitTypeGuild, 5, time.Second*10), api_team.AddMember)
		guildAuthApiAdmin.DELETE("/team/:teamid", api_team.DeleteTeam)
		guildAuthApiAdmin.DELETE("/team/:teamid/:snowflake", rl(middleware.RateLimitTypeGuild, 30, time.Minute), api_team.RemoveMember)
		guildAuthApiAdmin.GET("/team/:teamid/permissions", api_team.GetTeamPermissions)
		guildAuthApiAdmin.PATCH("/team/:teamid/permissions", rl(middleware.RateLimitTypeGuild, 5, time.Second*10), api_team.UpdateTeamPermissions)

		guildAuthApiAdmin.GET("/staff-override", api_override.GetOverrideHandler)
		guildAuthApiAdmin.POST("/staff-override", api_override.CreateOverrideHandler)
		guildAuthApiAdmin.DELETE("/staff-override", api_override.DeleteOverrideHandler)

		guildAuthApiSupport.GET("/analytics/overview",
			rl(middleware.RateLimitTypeUser, 5, time.Second*30),
			rl(middleware.RateLimitTypeGuild, 10, time.Minute),
			api_analytics.GetAnalyticsOverviewHandler,
		)
		guildAuthApiAdmin.GET("/analytics/staff",
			rl(middleware.RateLimitTypeUser, 5, time.Second*30),
			rl(middleware.RateLimitTypeGuild, 10, time.Minute),
			api_analytics.GetAnalyticsStaffHandler,
		)

		guildAuthApiAdmin.POST("/audit-logs", api_audit.GetAuditLogs)

		guildAuthApiAdmin.GET("/integrations/available", api_integrations.ListIntegrationsHandler)
		guildAuthApiAdmin.GET("/integrations/:integrationid", api_integrations.IsIntegrationActiveHandler)
		guildAuthApiAdmin.POST("/integrations/:integrationid",
			rl(middleware.RateLimitTypeUser, 10, time.Minute),
			rl(middleware.RateLimitTypeGuild, 10, time.Minute),
			rl(middleware.RateLimitTypeUser, 30, time.Minute*30),
			rl(middleware.RateLimitTypeGuild, 30, time.Minute*30),
			api_integrations.ActivateIntegrationHandler,
		)
		guildAuthApiAdmin.PATCH("/integrations/:integrationid", api_integrations.UpdateIntegrationSecretsHandler)
		guildAuthApiAdmin.DELETE("/integrations/:integrationid", api_integrations.RemoveIntegrationHandler)

		// KB articles
		guildAuthApiSupport.GET("/kb/articles", api_kb.ListArticlesHandler)
		guildAuthApiSupport.GET("/kb/articles/:articleId", api_kb.GetArticleHandler)
		guildAuthApiAdmin.POST("/kb/articles",
			rl(middleware.RateLimitTypeUser, 10, time.Minute),
			rl(middleware.RateLimitTypeGuild, 15, time.Minute),
			api_kb.CreateArticleHandler,
		)
		guildAuthApiAdmin.PATCH("/kb/articles/:articleId",
			rl(middleware.RateLimitTypeGuild, 30, time.Minute),
			api_kb.UpdateArticleHandler,
		)
		guildAuthApiAdmin.DELETE("/kb/articles/:articleId",
			rl(middleware.RateLimitTypeGuild, 30, time.Minute),
			api_kb.DeleteArticleHandler,
		)

		// KB settings
		guildAuthApiAdmin.GET("/kb/settings", api_kb.GetKBSettingsHandler)
		guildAuthApiAdmin.PATCH("/kb/settings",
			rl(middleware.RateLimitTypeGuild, 10, time.Minute),
			api_kb.UpdateKBSettingsHandler,
		)
		guildAuthApiAdmin.POST("/kb/settings/verify-domain",
			rl(middleware.RateLimitTypeGuild, 5, time.Minute),
			api_kb.VerifyDomainHandler,
		)

		// Gallery submissions (guild-scoped)
		guildAuthApiAdmin.POST("/gallery/submit/:panelid",
			rl(middleware.RateLimitTypeGuild, 5, time.Minute),
			api_gallery.SubmitHandler,
		)
		guildAuthApiAdmin.GET("/gallery/submissions", api_gallery.SubmissionsHandler)
		guildAuthApiAdmin.PUT("/gallery/submissions/:listingId", api_gallery.ResubmitHandler)
		guildAuthApiAdmin.DELETE("/gallery/submissions/:listingId", api_gallery.WithdrawHandler)
		guildAuthApiAdmin.POST("/gallery/import/:listingId",
			rl(middleware.RateLimitTypeGuild, 10, time.Minute),
			api_gallery.ImportHandler,
		)

		// KB categories
		guildAuthApiSupport.GET("/kb/categories", api_kb.ListCategoriesHandler)
		guildAuthApiAdmin.POST("/kb/categories",
			rl(middleware.RateLimitTypeUser, 10, time.Minute),
			rl(middleware.RateLimitTypeGuild, 15, time.Minute),
			api_kb.CreateCategoryHandler,
		)
		guildAuthApiAdmin.PATCH("/kb/categories/:catId",
			rl(middleware.RateLimitTypeGuild, 30, time.Minute),
			api_kb.UpdateCategoryHandler,
		)
		guildAuthApiAdmin.DELETE("/kb/categories/:catId",
			rl(middleware.RateLimitTypeGuild, 30, time.Minute),
			api_kb.DeleteCategoryHandler,
		)
	}

	userGroup := router.Group("/user", middleware.AuthenticateToken, middleware.UpdateLastSeen)
	{
		userGroup.POST("/guilds/reload", api.ReloadGuildsHandler)
		userGroup.GET("/permissionlevel", api.GetPermissionLevel)

		{
			whitelabelGroup := userGroup.Group("/whitelabel", middleware.VerifyWhitelabel(true))

			whitelabelGroup.GET("/", api_whitelabel.WhitelabelGet)
			whitelabelGroup.GET("/errors", api_whitelabel.WhitelabelGetErrors)
			whitelabelGroup.GET("/guilds", api_whitelabel.WhitelabelGetGuilds)
			whitelabelGroup.POST("/create-interactions", api_whitelabel.GetWhitelabelCreateInteractions())
			whitelabelGroup.DELETE("/", api_whitelabel.WhitelabelDelete)

			whitelabelGroup.POST("/", rl(middleware.RateLimitTypeUser, 5, time.Minute), api_whitelabel.WhitelabelPost())
			whitelabelGroup.POST("/status", rl(middleware.RateLimitTypeUser, 1, time.Second*5), api_whitelabel.WhitelabelStatusPost)
			whitelabelGroup.DELETE("/status", rl(middleware.RateLimitTypeUser, 1, time.Second*5), api_whitelabel.WhitelabelStatusDelete)
		}
	}

	adminGroup := apiGroup.Group("/admin", middleware.AdminOnly)
	{
		adminGroup.GET("/bot-staff", botstaff.ListBotStaffHandler)
		adminGroup.POST("/bot-staff/:userid", botstaff.AddBotStaffHandler)
		adminGroup.DELETE("/bot-staff/:userid", botstaff.RemoveBotStaffHandler)
		adminGroup.GET("/entitlements", admin_entitlements.ListEntitlementsHandler)
		adminGroup.GET("/premium-keys", admin_premiumkeys.ListPremiumKeysHandler)
		adminGroup.GET("/global-blacklist", admin_globalblacklist.ListHandler)
		adminGroup.POST("/global-blacklist/:userid", admin_globalblacklist.AddHandler)
		adminGroup.DELETE("/global-blacklist/:userid", admin_globalblacklist.RemoveHandler)
		adminGroup.GET("/server-blacklist", admin_serverblacklist.ListHandler)
		adminGroup.POST("/server-blacklist/:guildid", admin_serverblacklist.AddHandler)
		adminGroup.DELETE("/server-blacklist/:guildid", admin_serverblacklist.RemoveHandler)
		adminGroup.GET("/skus", admin_skus.ListHandler)
		adminGroup.POST("/skus", admin_skus.CreateHandler)
		adminGroup.PUT("/skus/:skuid", admin_skus.UpdateHandler)
		adminGroup.DELETE("/skus/:skuid", admin_skus.DeleteHandler)
		adminGroup.GET("/polar-products", admin_polarproducts.ListHandler)
		adminGroup.POST("/polar-products", admin_polarproducts.CreateHandler)
		adminGroup.PUT("/polar-products/:productid", admin_polarproducts.UpdateHandler)
		adminGroup.DELETE("/polar-products/:productid", admin_polarproducts.DeleteHandler)
		adminGroup.POST("/premium-keys/generate", admin_premiumkeys.GenerateHandler)

		// Gallery moderation
		adminGroup.GET("/gallery", admin_gallery.ListHandler)
		adminGroup.POST("/gallery/:id/approve", admin_gallery.ApproveHandler)
		adminGroup.POST("/gallery/:id/reject", admin_gallery.RejectHandler)
		adminGroup.PUT("/gallery/:id", admin_gallery.UpdateHandler)
		adminGroup.DELETE("/gallery/:id", admin_gallery.RemoveHandler)

		// Custom integration moderation
		adminGroup.GET("/integrations", admin_integrations.ListIntegrationsHandler)
		adminGroup.POST("/integrations/:integrationid/approve", admin_integrations.ApproveIntegrationHandler)
		adminGroup.POST("/integrations/:integrationid/reject", admin_integrations.RejectIntegrationHandler)
		adminGroup.POST("/integrations/:integrationid/unapprove", admin_integrations.UnapproveIntegrationHandler)
	}

	srv := &nethttp.Server{
		Addr:    config.Conf.Server.Host,
		Handler: router,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != nethttp.ErrServerClosed {
			panic(err)
		}
	}()

	return srv
}

func rl(rlType middleware.RateLimitType, limit int, period time.Duration) func(*gin.Context) {
	return middleware.CreateRateLimiter(rlType, limit, period)
}
