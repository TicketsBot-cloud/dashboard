package config

import (
	"os"

	"github.com/BurntSushi/toml"
	"github.com/caarlos0/env/v11"
	"go.uber.org/zap/zapcore"
)

type Config struct {
	Admins          []uint64      `env:"ADMINS"`
	ForceWhitelabel []uint64      `env:"FORCED_WHITELABEL"`
	Debug           bool          `env:"DEBUG"`
	SentryDsn       *string       `env:"SENTRY_DSN"`
	JsonLogs        bool          `env:"JSON_LOGS" envDefault:"false"`
	LogLevel        zapcore.Level `env:"LOG_LEVEL" envDefault:"info"`
	Server          struct {
		Host       string `env:"SERVER_ADDR,required"`
		MetricHost string `env:"METRIC_SERVER_ADDR"`
		BaseUrl    string `env:"BASE_URL,required"`
		MainSite   string `env:"MAIN_SITE,required"`
		Ratelimit  struct {
			Window int `env:"WINDOW,required"`
			Max    int `env:"MAX,required"`
		} `envPrefix:"RATELIMIT_"`
		Secret         string   `env:"JWT_SECRET,required"`
		RealIpHeaders  []string `env:"REAL_IP_HEADERS"`
		TrustedProxies []string `env:"TRUSTED_PROXIES"`
	}
	Oauth struct {
		Id          uint64 `env:"ID,required"`
		Secret      string `env:"SECRET,required"`
		RedirectUri string `env:"REDIRECT_URI,required"`
	} `envPrefix:"OAUTH_"`
	Database struct {
		Uri string `env:"URI,required"`
	} `envPrefix:"DATABASE_"`
	Bot struct {
		Id                                   uint64 `env:"BOT_ID,required"`
		Token                                string `env:"BOT_TOKEN,required"`
		ObjectStore                          string `env:"LOG_ARCHIVER_URL"`
		AesKey                               string `env:"LOG_AES_KEY" toml:"aes-key"`
		ProxyUrl                             string `env:"DISCORD_PROXY_URL" toml:"discord-proxy-url"`
		InteractionsBaseUrl                  string `env:"INTERACTIONS_BASE_URL" envDefault:"https://gateway.tickets.bot"`
		RenderServiceUrl                     string `env:"RENDER_SERVICE_URL" toml:"render-service-url"`
		ImageProxySecret                     string `env:"IMAGE_PROXY_SECRET" toml:"image-proxy-secret"`
		PublicIntegrationRequestWebhookId    uint64 `env:"PUBLIC_INTEGRATION_REQUEST_WEBHOOK_ID" toml:"public-integration-request-webhook-id"`
		PublicIntegrationRequestWebhookToken string `env:"PUBLIC_INTEGRATION_REQUEST_WEBHOOK_TOKEN" toml:"public-integration-request-webhook-token"`
		PoweredBy                            string `env:"POWEREDBY" envDefault:"tickets.bot"`
		IconUrl                              string `env:"ICON_URL" envDefault:"https://tickets.bot/assets/img/logo.png"`
	}
	Redis struct {
		Host     string `env:"HOST,required"`
		Port     int    `env:"PORT,required"`
		Password string `env:"PASSWORD"`
		Threads  int    `env:"THREADS,required"`
	} `envPrefix:"REDIS_"`
	Cache struct {
		Uri string `env:"URI,required"`
	} `envPrefix:"CACHE_"`
	SecureProxyUrl string `env:"SECURE_PROXY_URL"`
	S3Import       struct {
		Endpoint         string `env:"ENDPOINT,required"`
		Secure           bool   `env:"SECURE" envDefault:"true"`
		AccessKey        string `env:"ACCESS_KEY,required"`
		SecretKey        string `env:"SECRET_KEY,required"`
		TranscriptBucket string `env:"TRANSCRIPT_BUCKET,required"`
		DataBucket       string `env:"DATA_BUCKET,required"`
	} `envPrefix:"S3_IMPORT_"`
}

// TODO: Don't use a global variable
var Conf Config

func LoadConfig() (Config, error) {
	if _, err := os.Stat("config.toml"); err == nil {
		return fromToml()
	} else {
		return fromEnvvar()
	}
}

func fromToml() (Config, error) {
	var config Config
	if _, err := toml.DecodeFile("config.toml", &Conf); err != nil {
		return Config{}, err
	}

	return config, nil
}

func fromEnvvar() (Config, error) {
	return env.ParseAs[Config]()
}
