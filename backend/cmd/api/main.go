package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/pprof"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/TicketsBot-cloud/archiverclient"
	"github.com/TicketsBot-cloud/common/chatrelay"
	"github.com/TicketsBot-cloud/common/experiments"
	"github.com/TicketsBot-cloud/common/featureflags"
	"github.com/TicketsBot-cloud/common/model"
	"github.com/TicketsBot-cloud/common/observability"
	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/common/secureproxy"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/TicketsBot-cloud/worker/i18n"
	"github.com/getsentry/sentry-go"
	app "github.com/ticketsbot-cloud/dashboard/backend/app/http"
	admin_featureflags "github.com/ticketsbot-cloud/dashboard/backend/app/http/endpoints/api/admin/featureflags"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/endpoints/api/ticket/livechat"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/email"
	"github.com/ticketsbot-cloud/dashboard/backend/growthbook"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"github.com/ticketsbot-cloud/dashboard/backend/redis"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc/cache"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	_ "github.com/joho/godotenv/autoload"
)

var Logger *zap.Logger

func main() {
	startPprof()

	cfg, err := config.LoadConfig()
	utils.Must(err)
	config.Conf = cfg

	if config.Conf.SentryDsn != nil {
		sentryOpts := sentry.ClientOptions{
			Dsn:              *config.Conf.SentryDsn,
			Debug:            config.Conf.Debug,
			AttachStacktrace: true,
			EnableTracing:    true,
			TracesSampleRate: 1,
		}

		if err := sentry.Init(sentryOpts); err != nil {
			fmt.Printf("Failed to initialise sentry: %s", err.Error())
		}
	}

	var logger *zap.Logger
	if config.Conf.JsonLogs {
		loggerConfig := zap.NewProductionConfig()
		loggerConfig.Level.SetLevel(config.Conf.LogLevel)

		logger, err = loggerConfig.Build(
			zap.AddCaller(),
			zap.AddStacktrace(zap.ErrorLevel),
			zap.WrapCore(observability.ZapSentryAdapter(observability.EnvironmentProduction)),
		)
	} else {
		loggerConfig := zap.NewDevelopmentConfig()
		loggerConfig.Level.SetLevel(config.Conf.LogLevel)
		loggerConfig.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder

		logger, err = loggerConfig.Build(zap.AddCaller(), zap.AddStacktrace(zap.ErrorLevel))
	}

	if err != nil {
		panic(fmt.Errorf("failed to initialise zap logger: %w", err))
	}

	log.Logger = logger

	logger.Info("Connecting to database")
	database.ConnectToDatabase()

	logger.Info("Connecting to cache")
	cache.Instance = cache.NewCache()

	logger.Info("Initialising microservice clients")
	utils.ArchiverClient = archiverclient.NewArchiverClient(archiverclient.NewProxyRetriever(config.Conf.Bot.ObjectStore), []byte(config.Conf.Bot.AesKey))
	utils.SecureProxyClient = secureproxy.NewSecureProxy(config.Conf.SecureProxyUrl)

	i18n.Init()

	email.Init(config.Conf.Mailgun.Domain, config.Conf.Mailgun.ApiKey, config.Conf.Mailgun.FromEmail, config.Conf.Mailgun.FromName, config.Conf.Mailgun.UseEU)

	if config.Conf.Bot.ProxyUrl != "" {
		request.RegisterHook(utils.ProxyHook)
	}

	logger.Info("Connecting to Redis")
	redis.Client = redis.NewRedisClient()

	expManager := experiments.NewManager(redis.Client.Client, database.Client)
	experiments.SetGlobalManager(expManager)

	// The management client is what the admin pages use. Its API key can mutate
	// flag state, so it stays server-side and is never returned in a response.
	admin_featureflags.Client = growthbook.NewClient(
		config.Conf.FeatureFlags.ApiHost,
		config.Conf.GrowthBookApiKey,
		config.Conf.FeatureFlags.ClientKey,
	)
	if !admin_featureflags.Client.Configured() {
		logger.Warn("GrowthBook management API not configured, admin flag pages will be unavailable")
	}

	logger.Info("Configuring feature flags")
	utils.ExposureRecorder = featureflags.NewRecorder(
		logger.With(zap.String("service", "feature_flag_exposures")),
		featureflags.SinkFunc(func(ctx context.Context, exposures []featureflags.RecordedExposure) error {
			rows := make([]dbmodel.ExperimentExposure, 0, len(exposures))
			for _, exposure := range exposures {
				rows = append(rows, dbmodel.ExperimentExposure{
					ExperimentKey:  exposure.ExperimentKey,
					VariationId:    exposure.VariationId,
					IdentifierType: exposure.IdentifierType,
					Identifier:     exposure.Identifier,
					FeatureKey:     exposure.FeatureKey,
					ExposedAt:      exposure.ExposedAt,
				})
			}

			return database.Client.ExperimentExposures.InsertBatch(ctx, rows)
		}),
		featureflags.NewRedisDeduper(redis.Client.Client),
		featureflags.RecorderConfig{},
	)

	// A GrowthBook outage must not stop the API booting, so a failure here is
	// logged. New only errors on genuine misconfiguration (not on GrowthBook
	// simply being unreachable, which it retries in the background). A nil
	// utils.FeatureFlags evaluates every flag as enabled, which is correct when
	// GrowthBook was never configured at all, but wrong when it was configured
	// and construction still failed - that deployment intended to use
	// GrowthBook, so it must keep failing closed like an unreachable backend
	// does, not fail open.
	utils.FeatureFlags, err = featureflags.New(
		context.Background(),
		config.Conf.FeatureFlags,
		logger.With(zap.String("service", "feature_flags")),
		redis.Client.Client,
		utils.ExposureRecorder,
	)
	if err != nil {
		logger.Error("Failed to configure feature flags", zap.Error(err))

		if config.Conf.FeatureFlags.Attempted() {
			// Some GrowthBook configuration was supplied and New still failed, so
			// this is not the self-hosted "no GrowthBook at all" case - that
			// includes a partial config (only one of ApiHost/ClientKey set), which
			// New now rejects as an error rather than silently falling through to
			// unconfigured. Using Attempted rather than Enabled here matters: Enabled
			// is false for a partial config too, and gating on it would route this
			// exact failure back to the fail-open default. Build a fail-closed
			// client with an empty ruleset instead of leaving utils.FeatureFlags
			// nil, which would otherwise evaluate every flag, including kill
			// switches, as enabled.
			utils.FeatureFlags, err = featureflags.NewOffline(context.Background(), logger, "{}", utils.ExposureRecorder)
			if err != nil {
				logger.Error("Failed to build fail-closed feature flags fallback, every flag will evaluate to enabled", zap.Error(err))
			} else {
				logger.Warn("Feature flags falling back to a fail-closed client: every flag evaluates to off until this is fixed")
			}
		} else {
			logger.Warn("Feature flags unavailable with GrowthBook not configured: every flag evaluates to enabled")
		}
	}

	socketManager := livechat.NewSocketManager()
	go socketManager.Run()

	go ListenChat(redis.Client, socketManager)

	if !config.Conf.Debug {
		rpc.PremiumClient = premium.NewPremiumLookupClient(
			redis.Client.Client,
			cache.Instance.PgCache,
			database.Client,
		)
	} else {
		c := premium.NewMockLookupClient(premium.Whitelabel, model.EntitlementSourcePatreon)
		rpc.PremiumClient = &c
	}

	logger.Info("Starting server")
	srv := app.StartServer(logger, socketManager)

	shutdownCh := make(chan os.Signal, 1)
	signal.Notify(shutdownCh, syscall.SIGINT, syscall.SIGTERM)
	<-shutdownCh

	logger.Info("Received shutdown signal")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("HTTP server shutdown error", zap.Error(err))
	}

	// Flush queued exposures before exit, otherwise a rolling restart silently
	// discards whatever this pod had accepted but not yet written.
	if err := utils.FeatureFlags.Close(); err != nil {
		logger.Warn("Failed to close feature flag client", zap.Error(err))
	}

	if utils.ExposureRecorder != nil {
		if err := utils.ExposureRecorder.Close(); err != nil {
			logger.Warn("Failed to flush exposure recorder", zap.Error(err))
		}
	}

	if !sentry.Flush(2 * time.Second) {
		logger.Warn("Sentry flush timed out, some events may be lost")
	}

	logger.Info("Shutdown complete")
}

func ListenChat(client *redis.RedisClient, sm *livechat.SocketManager) {
	ch := make(chan chatrelay.MessageData)
	go chatrelay.Listen(client.Client, ch)

	for event := range ch {
		sm.BroadcastMessage(event)
	}
}

func startPprof() {
	mux := http.NewServeMux()
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/{action}", pprof.Index)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)

	go func() {
		http.ListenAndServe(":6060", mux)
	}()
}
