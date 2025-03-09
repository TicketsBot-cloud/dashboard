package main

import (
	"fmt"
	"net/http"
	"net/http/pprof"

	"github.com/TicketsBot-cloud/archiverclient"
	"github.com/TicketsBot-cloud/common/chatrelay"
	"github.com/TicketsBot-cloud/common/model"
	"github.com/TicketsBot-cloud/common/observability"
	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/common/secureproxy"
	app "github.com/TicketsBot-cloud/dashboard/app/http"
	"github.com/TicketsBot-cloud/dashboard/app/http/endpoints/api/ticket/livechat"
	"github.com/TicketsBot-cloud/dashboard/config"
	"github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/log"
	"github.com/TicketsBot-cloud/dashboard/redis"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/s3"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot/worker/i18n"
	"github.com/getsentry/sentry-go"
	"github.com/rxdn/gdl/rest/request"
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
			TracesSampleRate: 0.1,
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

	logger.Info("Connecting to import S3")
	s3.ConnectS3(config.Conf.S3Import.Endpoint, config.Conf.S3Import.AccessKey, config.Conf.S3Import.SecretKey, config.Conf.S3Import.Secure)

	logger.Info("Initialising microservice clients")
	utils.ArchiverClient = archiverclient.NewArchiverClient(archiverclient.NewProxyRetriever(config.Conf.Bot.ObjectStore), []byte(config.Conf.Bot.AesKey))
	utils.SecureProxyClient = secureproxy.NewSecureProxy(config.Conf.SecureProxyUrl)

	utils.LoadEmoji()

	i18n.Init()

	if config.Conf.Bot.ProxyUrl != "" {
		request.RegisterHook(utils.ProxyHook)
	}

	logger.Info("Connecting to Redis")
	redis.Client = redis.NewRedisClient()

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
	app.StartServer(logger, socketManager)
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
