package api_analytics

import (
	"context"
	"time"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/log"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

type (
	staffResponse struct {
		Staff []staffMemberStats `json:"staff"`
	}

	staffMemberStats struct {
		UserId         uint64   `json:"user_id,string"`
		Username       string   `json:"username"`
		Avatar         string   `json:"avatar"`
		TicketsClaimed int      `json:"tickets_claimed"`
		AverageRating  *float32 `json:"average_rating"`
		RatingCount    int      `json:"rating_count"`
	}
)

func GetAnalyticsStaffHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	days := parseDays(ctx)

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// Single query: get all staff who claimed tickets within the time window,
	// along with their claim count, average rating, and rating count.
	query := `
SELECT
	tc.user_id,
	COUNT(*) AS tickets_claimed,
	AVG(sr.rating)::float4 AS avg_rating,
	COUNT(sr.rating) AS rating_count
FROM ticket_claims tc
INNER JOIN tickets t
	ON tc.guild_id = t.guild_id AND tc.ticket_id = t.id
LEFT JOIN service_ratings sr
	ON tc.guild_id = sr.guild_id AND tc.ticket_id = sr.ticket_id
WHERE tc.guild_id = $1
	AND t.open_time > NOW() - $2::interval
GROUP BY tc.user_id
ORDER BY tickets_claimed DESC
LIMIT 50;`

	interval := time.Duration(days) * 24 * time.Hour

	rows, err := dbclient.Client.Tickets.Query(timeoutCtx, query, guildId, interval)
	if err != nil {
		log.Logger.Error("Failed to query staff analytics", zap.Uint64("guild_id", guildId), zap.Error(err))
		ctx.JSON(500, utils.ErrorStr("Failed to retrieve staff analytics. Please try again later."))
		return
	}
	defer rows.Close()

	var userIds []uint64
	staffMap := make(map[uint64]*staffMemberStats)

	for rows.Next() {
		var s staffMemberStats
		if err := rows.Scan(&s.UserId, &s.TicketsClaimed, &s.AverageRating, &s.RatingCount); err != nil {
			log.Logger.Error("Failed to scan staff analytics row", zap.Error(err))
			ctx.JSON(500, utils.ErrorStr("Failed to retrieve staff analytics. Please try again later."))
			return
		}
		userIds = append(userIds, s.UserId)
		staffMap[s.UserId] = &s
	}

	// Resolve usernames from cache
	if len(userIds) > 0 {
		users, err := cache.Instance.GetUsers(timeoutCtx, userIds)
		if err != nil {
			log.Logger.Warn("Failed to resolve user data for staff analytics", zap.Error(err))
			// Non-fatal — we'll just have empty usernames
		} else {
			for id, u := range users {
				if s, ok := staffMap[id]; ok {
					s.Username = u.Username
					s.Avatar = u.AvatarUrl(256)
				}
			}
		}
	}

	// Build ordered response
	resp := staffResponse{
		Staff: make([]staffMemberStats, 0, len(userIds)),
	}
	for _, id := range userIds {
		if s, ok := staffMap[id]; ok {
			resp.Staff = append(resp.Staff, *s)
		}
	}

	ctx.JSON(200, resp)
}
