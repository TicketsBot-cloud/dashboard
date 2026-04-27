package api_analytics

import (
	"context"
	"time"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/log"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/jackc/pgtype"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
)

type (
	staffResponse struct {
		Staff []staffMemberStats `json:"staff"`
	}

	staffMemberStats struct {
		UserId          uint64   `json:"user_id,string"`
		Username        string   `json:"username"`
		Avatar          string   `json:"avatar"`
		TicketsAnswered int      `json:"tickets_answered"`
		TicketsClaimed  int      `json:"tickets_claimed"`
		AverageRating   *float32 `json:"average_rating"`
		RatingCount     int      `json:"rating_count"`
	}
)

func GetAnalyticsStaffHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	days := parseDays(ctx)

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// Step 1: Resolve actual staff user IDs from the permission system.
	// This mirrors how /stats user checks permissions — direct assignments,
	// support team membership, and role-based permissions.
	var directStaff []uint64
	var teamMembers []uint64
	var adminRoles, supportRoles, teamRoles []uint64

	group, groupCtx := errgroup.WithContext(timeoutCtx)

	group.Go(func() (err error) {
		directStaff, err = dbclient.Client.Permissions.GetSupport(groupCtx, guildId)
		return
	})

	group.Go(func() (err error) {
		teamMembers, err = dbclient.Client.SupportTeamMembers.GetAllSupportMembers(groupCtx, guildId)
		return
	})

	group.Go(func() (err error) {
		adminRoles, err = dbclient.Client.RolePermissions.GetAdminRoles(groupCtx, guildId)
		return
	})

	group.Go(func() (err error) {
		supportRoles, err = dbclient.Client.RolePermissions.GetSupportRoles(groupCtx, guildId)
		return
	})

	group.Go(func() (err error) {
		teamRoles, err = dbclient.Client.SupportTeamRoles.GetAllSupportRoles(groupCtx, guildId)
		return
	})

	if err := group.Wait(); err != nil {
		log.Logger.Error("Failed to resolve staff members", zap.Uint64("guild_id", guildId), zap.Error(err))
		ctx.JSON(500, utils.ErrorStr("Failed to retrieve staff analytics. Please try again later."))
		return
	}

	// Collect all staff role IDs
	staffRoleSet := make(map[uint64]bool)
	for _, r := range adminRoles {
		staffRoleSet[r] = true
	}
	for _, r := range supportRoles {
		staffRoleSet[r] = true
	}
	for _, r := range teamRoles {
		staffRoleSet[r] = true
	}

	// Deduplicate staff user IDs from direct assignments + team membership
	staffSet := make(map[uint64]bool)
	for _, id := range directStaff {
		staffSet[id] = true
	}
	for _, id := range teamMembers {
		staffSet[id] = true
	}

	// Resolve role-based staff from cached guild members
	if len(staffRoleSet) > 0 {
		cachedMembers, err := cache.Instance.GetGuildMembers(timeoutCtx, guildId, false)
		if err != nil {
			log.Logger.Warn("Failed to fetch cached guild members for staff resolution", zap.Error(err))
		} else {
			for _, m := range cachedMembers {
				if staffSet[m.User.Id] {
					continue
				}
				for _, roleId := range m.Roles {
					if staffRoleSet[roleId] {
						staffSet[m.User.Id] = true
						break
					}
				}
			}
		}
	}

	if len(staffSet) == 0 {
		ctx.JSON(200, staffResponse{Staff: []staffMemberStats{}})
		return
	}

	// Step 2: Query analytics for the resolved staff user IDs.
	staffUserIds := make([]uint64, 0, len(staffSet))
	for id := range staffSet {
		staffUserIds = append(staffUserIds, id)
	}

	staffIdArray := &pgtype.Int8Array{}
	if err := staffIdArray.Set(staffUserIds); err != nil {
		log.Logger.Error("Failed to build staff ID array", zap.Error(err))
		ctx.JSON(500, utils.ErrorStr("Failed to retrieve staff analytics. Please try again later."))
		return
	}

	interval := time.Duration(days) * 24 * time.Hour

	query := `
SELECT
	staff.user_id,
	COALESCE(answered.cnt, 0) AS tickets_answered,
	COALESCE(claimed.cnt, 0) AS tickets_claimed,
	ratings.avg_rating,
	COALESCE(ratings.rating_count, 0) AS rating_count
FROM unnest($3::int8[]) AS staff(user_id)
LEFT JOIN LATERAL (
	SELECT COUNT(DISTINCT p.ticket_id) AS cnt
	FROM participant p
	INNER JOIN tickets t ON p.guild_id = t.guild_id AND p.ticket_id = t.id
	WHERE p.guild_id = $1 AND p.user_id = staff.user_id
		AND t.open_time > NOW() - $2::interval
		AND p.user_id != t.user_id
) answered ON true
LEFT JOIN LATERAL (
	SELECT COUNT(*) AS cnt
	FROM ticket_claims tc
	INNER JOIN tickets t ON tc.guild_id = t.guild_id AND tc.ticket_id = t.id
	WHERE tc.guild_id = $1 AND tc.user_id = staff.user_id
		AND t.open_time > NOW() - $2::interval
) claimed ON true
LEFT JOIN LATERAL (
	SELECT AVG(sr.rating)::float4 AS avg_rating, COUNT(sr.rating) AS rating_count
	FROM service_ratings sr
	INNER JOIN ticket_claims tc ON sr.guild_id = tc.guild_id AND sr.ticket_id = tc.ticket_id
	INNER JOIN tickets t ON sr.guild_id = t.guild_id AND sr.ticket_id = t.id
	WHERE sr.guild_id = $1 AND tc.user_id = staff.user_id
		AND t.open_time > NOW() - $2::interval
) ratings ON true
ORDER BY tickets_answered DESC, tickets_claimed DESC
LIMIT 50;`

	rows, err := dbclient.Client.Tickets.Query(timeoutCtx, query, guildId, interval, staffIdArray)
	if err != nil {
		log.Logger.Error("Failed to query staff analytics", zap.Uint64("guild_id", guildId), zap.Error(err))
		ctx.JSON(500, utils.ErrorStr("Failed to retrieve staff analytics. Please try again later."))
		return
	}
	defer rows.Close()

	var resultIds []uint64
	staffMap := make(map[uint64]*staffMemberStats)

	for rows.Next() {
		var s staffMemberStats
		if err := rows.Scan(&s.UserId, &s.TicketsAnswered, &s.TicketsClaimed, &s.AverageRating, &s.RatingCount); err != nil {
			log.Logger.Error("Failed to scan staff analytics row", zap.Error(err))
			ctx.JSON(500, utils.ErrorStr("Failed to retrieve staff analytics. Please try again later."))
			return
		}
		resultIds = append(resultIds, s.UserId)
		staffMap[s.UserId] = &s
	}

	// Resolve usernames from cache and identify bots
	botIds := make(map[uint64]bool)
	if len(resultIds) > 0 {
		users, err := cache.Instance.GetUsers(timeoutCtx, resultIds)
		if err != nil {
			log.Logger.Warn("Failed to resolve user data for staff analytics", zap.Error(err))
		} else {
			for id, u := range users {
				if u.Bot {
					botIds[id] = true
					continue
				}
				if s, ok := staffMap[id]; ok {
					s.Username = u.Username
					s.Avatar = u.AvatarUrl(256)
				}
			}
		}
	}

	// Build ordered response, excluding bots
	resp := staffResponse{
		Staff: make([]staffMemberStats, 0, len(resultIds)),
	}
	for _, id := range resultIds {
		if botIds[id] {
			continue
		}
		if s, ok := staffMap[id]; ok {
			resp.Staff = append(resp.Staff, *s)
		}
	}

	ctx.JSON(200, resp)
}
