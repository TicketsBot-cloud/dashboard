module github.com/ticketsbot-cloud/dashboard/backend

go 1.26.0

// replace github.com/TicketsBot-cloud/database => ../../database

// replace github.com/TicketsBot-cloud/common => ../../common

// replace github.com/TicketsBot-cloud/worker => ../../worker

// replace github.com/TicketsBot-cloud/gdl => ../../gdl

replace github.com/go-playground/validator/v10 => github.com/go-playground/validator/v10 v10.14.0

require (
	github.com/BurntSushi/toml v1.6.0
	github.com/TicketsBot-cloud/archiverclient v0.0.0-20260912070140-b0cd1b003b87
	github.com/TicketsBot-cloud/common v0.0.0-20261022190115-887ce60dce1b
	github.com/TicketsBot-cloud/database v0.0.0-20261022191045-27b0736fc5a3
	github.com/TicketsBot-cloud/gdl v0.0.0-20261022191043-9caa827c743a
	github.com/TicketsBot-cloud/logarchiver v0.0.0-20260929182354-92f0b13a1e1f
	github.com/TicketsBot-cloud/worker v0.0.0-20261026221951-1d6f2e690ed4
	github.com/apex/log v1.9.0
	github.com/caarlos0/env/v11 v11.4.1
	github.com/getsentry/sentry-go v0.33.0
	github.com/getsentry/sentry-go/gin v0.33.0
	github.com/gin-gonic/contrib v0.0.0-20260101091603-d12f07a9136b
	github.com/gin-gonic/gin v1.12.0
	github.com/go-playground/validator/v10 v10.30.5
	github.com/go-redis/redis v6.15.9+incompatible
	github.com/go-redis/redis/v8 v8.11.5
	github.com/go-redis/redis_rate/v9 v9.1.2
	github.com/golang-jwt/jwt v3.2.2+incompatible
	github.com/google/uuid v1.6.0
	github.com/gorilla/websocket v1.5.3
	github.com/jackc/pgconn v1.14.3
	github.com/jackc/pgtype v1.14.4
	github.com/jackc/pgx/v4 v4.18.3
	github.com/joho/godotenv v1.5.1
	github.com/mailgun/mailgun-go/v4 v4.23.0
	github.com/penglongli/gin-metrics v0.1.13
	github.com/pkg/errors v0.9.1
	github.com/polarsource/polar-go v0.16.0
	github.com/prometheus/client_golang v1.25.0
	github.com/sirupsen/logrus v1.10.2
	github.com/stretchr/testify v1.12.1
	github.com/weppos/publicsuffix-go v0.50.3
	go.uber.org/zap v1.28.0
	golang.org/x/net v0.61.0
	golang.org/x/sync v0.24.0
)

require (
	github.com/TicketsBot/common v0.0.0-20241117150316-ff54c97b45c1 // indirect
	github.com/TicketsBot/ttlcache v1.6.1-0.20200405150101-acc18e37b261 // indirect
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/bits-and-blooms/bitset v1.26.0 // indirect
	github.com/boj/redistore v0.0.0-20180917114910-cd5dcc76aeff // indirect
	github.com/boltdb/bolt v1.3.1 // indirect
	github.com/bytedance/gopkg v0.1.4 // indirect
	github.com/bytedance/sonic v1.15.4 // indirect
	github.com/bytedance/sonic/loader v0.5.3 // indirect
	github.com/caarlos0/env v3.5.0+incompatible // indirect
	github.com/caarlos0/env/v10 v10.0.0 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/clipperhouse/uax29/v2 v2.7.0 // indirect
	github.com/cloudwego/base64x v0.1.7 // indirect
	github.com/dgryski/go-rendezvous v0.0.0-20200823014737-9f7001d12a5f // indirect
	github.com/dustin/go-humanize v1.1.0 // indirect
	github.com/elliotchance/orderedmap v1.8.0 // indirect
	github.com/gabriel-vasile/mimetype v1.4.16 // indirect
	github.com/gin-contrib/sse v1.1.2 // indirect
	github.com/go-chi/chi/v5 v5.5.0 // indirect
	github.com/go-playground/locales v0.14.2 // indirect
	github.com/go-playground/universal-translator v0.18.2 // indirect
	github.com/go-redsync/redsync/v4 v4.18.0 // indirect
	github.com/goccy/go-json v0.11.2 // indirect
	github.com/goccy/go-yaml v1.19.2 // indirect
	github.com/gomodule/redigo v2.0.0+incompatible // indirect
	github.com/gorilla/context v1.1.2 // indirect
	github.com/gorilla/securecookie v1.1.2 // indirect
	github.com/gorilla/sessions v1.4.0 // indirect
	github.com/growthbook/growthbook-golang v0.2.9 // indirect
	github.com/jackc/chunkreader/v2 v2.0.1 // indirect
	github.com/jackc/pgio v1.0.0 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgproto3/v2 v2.3.3 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/pgx v3.6.2+incompatible // indirect
	github.com/jackc/pgx/v5 v5.11.0 // indirect
	github.com/jackc/puddle v1.3.0 // indirect
	github.com/jackc/puddle/v2 v2.2.3 // indirect
	github.com/jedib0t/go-pretty/v6 v6.8.3 // indirect
	github.com/json-iterator/go v1.1.12 // indirect
	github.com/juju/ratelimit v1.0.2 // indirect
	github.com/klauspost/compress v1.20.3 // indirect
	github.com/klauspost/cpuid/v2 v2.4.1 // indirect
	github.com/klauspost/crc32 v1.3.0 // indirect
	github.com/leodido/go-urn v1.5.0 // indirect
	github.com/mailgun/errors v0.6.0 // indirect
	github.com/mattn/go-isatty v0.0.24 // indirect
	github.com/mattn/go-runewidth v0.0.31 // indirect
	github.com/minio/crc64nvme v1.1.1 // indirect
	github.com/minio/md5-simd v1.1.2 // indirect
	github.com/minio/minio-go/v7 v7.4.1 // indirect
	github.com/mitchellh/colorstring v0.0.0-20190213212951-d06e56a500db // indirect
	github.com/modern-go/concurrent v0.0.0-20180306012644-bacd9c7ef1dd // indirect
	github.com/modern-go/reflect2 v1.0.2 // indirect
	github.com/munnerz/goautoneg v0.0.0-20191010083416-a7dc8b61c822 // indirect
	github.com/pasztorpisti/qs v0.0.0-20261010143646-f74307759693 // indirect
	github.com/pelletier/go-toml/v2 v2.4.3 // indirect
	github.com/philhofer/fwd v1.2.1 // indirect
	github.com/prometheus/client_model v0.6.3 // indirect
	github.com/prometheus/common v0.72.1 // indirect
	github.com/prometheus/procfs v0.22.0 // indirect
	github.com/quic-go/qpack v0.6.0 // indirect
	github.com/quic-go/quic-go v0.64.1 // indirect
	github.com/rivo/uniseg v0.4.7 // indirect
	github.com/rs/xid v1.6.0 // indirect
	github.com/schollz/progressbar/v3 v3.19.1 // indirect
	github.com/spyzhov/ajson v0.9.6 // indirect
	github.com/tatsuworks/czlib v0.0.0-20190916144400-8a51758ea0d9 // indirect
	github.com/tinylib/msgp v1.6.5 // indirect
	github.com/tmaxmax/go-sse v0.11.0 // indirect
	github.com/twitchyliquid64/golang-asm v0.15.1 // indirect
	github.com/ugorji/go/codec v1.3.2 // indirect
	github.com/zeebo/xxh3 v1.1.0 // indirect
	go.mongodb.org/mongo-driver/v2 v2.9.2 // indirect
	go.uber.org/atomic v1.12.0 // indirect
	go.uber.org/multierr v1.11.0 // indirect
	go.yaml.in/yaml/v3 v3.0.5 // indirect
	golang.org/x/arch v0.32.0 // indirect
	golang.org/x/crypto v0.58.0 // indirect
	golang.org/x/exp v0.0.0-20261014143641-f0251eb4aa3e // indirect
	golang.org/x/sys v0.49.0 // indirect
	golang.org/x/term v0.47.0 // indirect
	golang.org/x/text v0.43.0 // indirect
	google.golang.org/protobuf v1.36.12 // indirect
	gopkg.in/alexcesaro/statsd.v2 v2.0.0 // indirect
	gopkg.in/ini.v1 v1.67.3 // indirect
	nhooyr.io/websocket v1.8.17 // indirect
)
