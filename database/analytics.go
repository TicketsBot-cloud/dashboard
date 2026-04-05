package database

import (
	"time"

	analytics "github.com/TicketsBot-cloud/analytics-client"
	"github.com/TicketsBot-cloud/dashboard/config"
)

var AnalyticsClient *analytics.Client

func ConnectAnalytics() {
	cfg := config.Conf.Clickhouse
	if cfg.Address == "" {
		return // Analytics not configured
	}

	AnalyticsClient = analytics.Connect(cfg.Address, cfg.Threads, cfg.Database, cfg.Username, cfg.Password, 10*time.Second)
}
