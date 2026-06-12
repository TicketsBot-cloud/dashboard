package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/BurntSushi/toml"
	"github.com/caarlos0/env/v11"
	"go.uber.org/zap/zapcore"
)

type Config struct {
	Owner           uint64        `env:"OWNER"`
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
		KBBaseUrl  string `env:"KB_BASE_URL"`
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
	Polar struct {
		ApiKey                         string `env:"API_KEY"`
		IsSandbox                      bool   `env:"IS_SANDBOX"`
		CheckoutSuccessUrl             string `env:"CHECKOUT_SUCCESS_URL" envDefault:"http://localhost:5173/premium"`
		DefaultDiscountBasisPoints     int    `env:"DEFAULT_DISCOUNT_BASIS_POINTS" envDefault:"500"`
		DefaultCreditPercentage        int    `env:"DEFAULT_CREDIT_PERCENTAGE" envDefault:"10"`
		DefaultNonPremiumCreditPercent int    `env:"DEFAULT_NON_PREMIUM_CREDIT_PERCENTAGE" envDefault:"5"`
	} `envPrefix:"POLAR_"`
	Mailgun struct {
		Domain    string `env:"DOMAIN"`
		ApiKey    string `env:"API_KEY"`
		FromEmail string `env:"FROM_EMAIL" envDefault:"noreply@tickets.bot"`
		FromName  string `env:"FROM_NAME" envDefault:"Tickets Bot"`
		UseEU     bool   `env:"USE_EU" envDefault:"false"`
	} `envPrefix:"MAILGUN_"`
	SecureProxyUrl string `env:"SECURE_PROXY_URL"`
	Security       struct {
		VerificationHmacSecret string `env:"VERIFICATION_HMAC_SECRET" envDefault:"default-dev-secret-change-in-production"`
	} `envPrefix:"SECURITY_"`
}

// TODO: Don't use a global variable
var Conf Config

func LoadConfig() (Config, error) {
	var config Config
	var err error

	if _, statErr := os.Stat("config.toml"); statErr == nil {
		config, err = fromToml()
	} else {
		config, err = fromEnvvar()
	}

	if err != nil {
		return Config{}, err
	}

	if err := config.Validate(); err != nil {
		return Config{}, err
	}

	return config, nil
}

func (c Config) ExpectedOauthRedirectUri() string {
	return strings.TrimRight(c.Server.BaseUrl, "/") + "/oauth2/callback"
}

func (c Config) Validate() error {
	expectedRedirectUri := c.ExpectedOauthRedirectUri()
	if c.Oauth.RedirectUri != expectedRedirectUri {
		return fmt.Errorf("OAUTH_REDIRECT_URI must be %q for the dashboard OAuth flow, got %q", expectedRedirectUri, c.Oauth.RedirectUri)
	}

	return nil
}

func fromToml() (Config, error) {
	var config Config
	if _, err := toml.DecodeFile("config.toml", &config); err != nil {
		return Config{}, err
	}

	return config, nil
}

func fromEnvvar() (Config, error) {
	return env.ParseAs[Config]()
}
