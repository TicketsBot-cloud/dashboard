module github.com/TicketsBot-cloud/dashboard

go 1.24.0

toolchain go1.24.2

//replace github.com/TicketsBot-cloud/database => ../database

//replace github.com/TicketsBot-cloud/gdl => ../gdl

//replace github.com/TicketsBot-cloud/logarchiver => ../logarchiver

//replace github.com/TicketsBot-cloud/archiverclient => ../archiverclient

//replace github.com/TicketsBot-cloud/worker => ../worker

replace github.com/go-playground/validator/v10 => github.com/go-playground/validator/v10 v10.14.0

require (
	github.com/BurntSushi/toml v1.2.1
	github.com/TicketsBot-cloud/archiverclient v0.0.0-20251015181023-f0b66a074704
	github.com/TicketsBot-cloud/common v0.0.0-20260210203202-54154661338e
	github.com/TicketsBot-cloud/database v0.0.0-20260214180435-acb54713814d
	github.com/TicketsBot-cloud/gdl v0.0.0-20251129162044-695f8e5079eb
	github.com/TicketsBot-cloud/logarchiver v0.0.0-20251018211319-7a7df5cacbdc
	github.com/TicketsBot-cloud/worker v0.0.0-20251212162840-a9cc9bbf5692
	github.com/apex/log v1.1.2
	github.com/caarlos0/env/v11 v11.2.2
	github.com/getsentry/sentry-go v0.33.0
	github.com/getsentry/sentry-go/gin v0.33.0
	github.com/gin-gonic/contrib v0.0.0-20191209060500-d6e26eeaa607
	github.com/gin-gonic/gin v1.10.1
	github.com/go-playground/validator/v10 v10.20.0
	github.com/go-redis/redis v6.15.9+incompatible
	github.com/go-redis/redis/v8 v8.11.5
	github.com/go-redis/redis_rate/v9 v9.1.1
	github.com/golang-jwt/jwt v3.2.2+incompatible
	github.com/google/uuid v1.6.0
	github.com/gorilla/websocket v1.5.0
	github.com/jackc/pgconn v1.14.3
	github.com/jackc/pgtype v1.14.4
	github.com/jackc/pgx/v4 v4.18.3
	github.com/joho/godotenv v1.5.1
	github.com/minio/minio-go/v7 v7.0.95
	github.com/penglongli/gin-metrics v0.1.10
	github.com/pkg/errors v0.9.1
	github.com/prometheus/client_golang v1.22.0
	github.com/sirupsen/logrus v1.9.3
	github.com/stretchr/testify v1.10.0
	github.com/weppos/publicsuffix-go v0.20.0
	go.uber.org/zap v1.27.1
	golang.org/x/sync v0.19.0
)

require (
	github.com/ClickHouse/ch-go v0.66.0 // indirect
	github.com/ClickHouse/clickhouse-go/v2 v2.36.0 // indirect
	github.com/TicketsBot-cloud/analytics-client v0.0.0-20250604180646-6606dfc8fc8c // indirect
	github.com/TicketsBot/common v0.0.0-20241117150316-ff54c97b45c1 // indirect
	github.com/TicketsBot/ttlcache v1.6.1-0.20200405150101-acc18e37b261 // indirect
	github.com/andybalholm/brotli v1.1.1 // indirect
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/bits-and-blooms/bitset v1.2.0 // indirect
	github.com/boj/redistore v0.0.0-20180917114910-cd5dcc76aeff // indirect
	github.com/boltdb/bolt v1.3.1 // indirect
	github.com/bytedance/sonic v1.13.2 // indirect
	github.com/bytedance/sonic/loader v0.2.4 // indirect
	github.com/caarlos0/env v3.5.0+incompatible // indirect
	github.com/caarlos0/env/v10 v10.0.0 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/cloudwego/base64x v0.1.5 // indirect
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/dgryski/go-rendezvous v0.0.0-20200823014737-9f7001d12a5f // indirect
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/elliotchance/orderedmap v1.8.0 // indirect
	github.com/gabriel-vasile/mimetype v1.4.9 // indirect
	github.com/gin-contrib/sse v1.1.0 // indirect
	github.com/go-faster/city v1.0.1 // indirect
	github.com/go-faster/errors v0.7.1 // indirect
	github.com/go-ini/ini v1.67.0 // indirect
	github.com/go-playground/locales v0.14.1 // indirect
	github.com/go-playground/universal-translator v0.18.1 // indirect
	github.com/go-redsync/redsync/v4 v4.13.0 // indirect
	github.com/goccy/go-json v0.10.5 // indirect
	github.com/gomodule/redigo v2.0.0+incompatible // indirect
	github.com/gorilla/context v1.1.1 // indirect
	github.com/gorilla/securecookie v1.1.1 // indirect
	github.com/gorilla/sessions v1.2.1 // indirect
	github.com/hashicorp/errwrap v1.1.0 // indirect
	github.com/hashicorp/go-multierror v1.1.1 // indirect
	github.com/jackc/chunkreader/v2 v2.0.1 // indirect
	github.com/jackc/pgio v1.0.0 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgproto3/v2 v2.3.3 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/pgx v3.6.2+incompatible // indirect
	github.com/jackc/pgx/v5 v5.7.6 // indirect
	github.com/jackc/puddle v1.3.0 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/jedib0t/go-pretty/v6 v6.6.7 // indirect
	github.com/json-iterator/go v1.1.12 // indirect
	github.com/juju/ratelimit v1.0.2 // indirect
	github.com/klauspost/compress v1.18.0 // indirect
	github.com/klauspost/cpuid/v2 v2.3.0 // indirect
	github.com/leodido/go-urn v1.4.0 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/mattn/go-runewidth v0.0.16 // indirect
	github.com/minio/crc64nvme v1.1.1 // indirect
	github.com/minio/md5-simd v1.1.2 // indirect
	github.com/mitchellh/colorstring v0.0.0-20190213212951-d06e56a500db // indirect
	github.com/modern-go/concurrent v0.0.0-20180306012644-bacd9c7ef1dd // indirect
	github.com/modern-go/reflect2 v1.0.2 // indirect
	github.com/munnerz/goautoneg v0.0.0-20191010083416-a7dc8b61c822 // indirect
	github.com/pasztorpisti/qs v0.0.0-20171216220353-8d6c33ee906c // indirect
	github.com/paulmach/orb v0.11.1 // indirect
	github.com/pelletier/go-toml/v2 v2.2.4 // indirect
	github.com/philhofer/fwd v1.2.0 // indirect
	github.com/pierrec/lz4/v4 v4.1.22 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	github.com/prometheus/client_model v0.6.2 // indirect
	github.com/prometheus/common v0.63.0 // indirect
	github.com/prometheus/procfs v0.16.1 // indirect
	github.com/rivo/uniseg v0.4.7 // indirect
	github.com/rs/xid v1.6.0 // indirect
	github.com/schollz/progressbar/v3 v3.18.0 // indirect
	github.com/segmentio/asm v1.2.0 // indirect
	github.com/shopspring/decimal v1.4.0 // indirect
	github.com/tatsuworks/czlib v0.0.0-20190916144400-8a51758ea0d9 // indirect
	github.com/tinylib/msgp v1.4.0 // indirect
	github.com/twitchyliquid64/golang-asm v0.15.1 // indirect
	github.com/ugorji/go/codec v1.2.12 // indirect
	go.opentelemetry.io/otel v1.36.0 // indirect
	go.opentelemetry.io/otel/trace v1.36.0 // indirect
	go.uber.org/atomic v1.11.0 // indirect
	go.uber.org/multierr v1.11.0 // indirect
	golang.org/x/arch v0.17.0 // indirect
	golang.org/x/crypto v0.48.0 // indirect
	golang.org/x/exp v0.0.0-20251209150349-8475f28825e9 // indirect
	golang.org/x/net v0.49.0 // indirect
	golang.org/x/sys v0.41.0 // indirect
	golang.org/x/term v0.40.0 // indirect
	golang.org/x/text v0.34.0 // indirect
	google.golang.org/protobuf v1.36.6 // indirect
	gopkg.in/alexcesaro/statsd.v2 v2.0.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
	nhooyr.io/websocket v1.8.17 // indirect
)
