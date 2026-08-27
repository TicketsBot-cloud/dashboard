package database

import (
	"context"

	"github.com/TicketsBot-cloud/database"
	"github.com/jackc/pgconn"
	"github.com/jackc/pgconn/stmtcache"
	"github.com/jackc/pgx/v4"
	"github.com/jackc/pgx/v4/log/logrusadapter"
	"github.com/jackc/pgx/v4/pgxpool"
	"github.com/sirupsen/logrus"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
)

var Client *database.Database

func ConnectToDatabase() {
	dbConf := config.Conf.Database

	poolConfig, err := pgxpool.ParseConfig(dbConf.Uri)
	if err != nil {
		panic(err)
	}

	// TODO: Sentry
	poolConfig.ConnConfig.LogLevel = pgx.LogLevelWarn
	poolConfig.ConnConfig.Logger = logrusadapter.NewLogger(logrus.New())

	poolConfig.MinConns = 1
	poolConfig.MaxConns = dbConf.MaxConns

	poolConfig.ConnConfig.BuildStatementCache = func(conn *pgconn.PgConn) stmtcache.Cache {
		return stmtcache.New(conn, stmtcache.ModeDescribe, 512)
	}

	pool, err := pgxpool.ConnectConfig(context.Background(), poolConfig)
	if err != nil {
		panic(err)
	}

	Client = database.NewDatabase(pool)
}
