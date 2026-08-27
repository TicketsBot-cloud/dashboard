package api_analytics

import (
	"context"
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/common/premium"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/member"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgtype"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/botcontext"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/log"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc/cache"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
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

	botCtx, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
		return
	}

	premiumTier, err := rpc.PremiumClient.GetTierByGuildId(ctx, guildId, true, botCtx.Token, botCtx.RateLimiter)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request"))
		return
	}

	if premiumTier == premium.None {
		ctx.JSON(http.StatusPaymentRequired, utils.ErrorStr("Analytics requires a premium subscription."))
		return
	}

	days := parseDays(ctx)

	filter, ok := parsePanelFilter(ctx)
	if !ok {
		return
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// Step 1: Resolve actual staff user IDs from the permission system.
	// This mirrors how /stats user checks permissions - direct assignments,
	// support team membership, and role-based permissions.
	var directStaff []uint64
	var teamMembers []uint64
	var adminRoles, supportRoles, teamRoles []uint64
	var cachedMembers []member.Member

	group, groupCtx := errgroup.WithContext(timeoutCtx)
	group.SetLimit(fanOutLimit())

	// Separate group: this reads the member cache pool, so counting it against
	// fanOutLimit would serialise it behind the permission queries for nothing.
	var memberFetch errgroup.Group
	memberFetch.Go(func() error {
		members, err := cache.Instance.GetGuildMembers(timeoutCtx, guildId, false)
		if err != nil {
			log.Logger.Warn("Failed to fetch cached guild members for staff resolution", zap.Error(err))
			return nil
		}

		cachedMembers = members
		return nil
	})

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

	groupErr := group.Wait()
	_ = memberFetch.Wait()

	if groupErr != nil {
		log.Logger.Error("Failed to resolve staff members", zap.Uint64("guild_id", guildId), zap.Error(groupErr))
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

	panelArr, panelUnassigned, err := filter.Args()
	if err != nil {
		log.Logger.Error("Failed to build panel filter args", zap.Error(err))
		ctx.JSON(500, utils.ErrorStr("Failed to retrieve staff analytics. Please try again later."))
		return
	}

	// Grouped rather than LATERAL per staff member: the staff set is unbounded,
	// and ORDER BY on computed columns means LIMIT 50 cannot prune before sorting.
	query := `
WITH scoped AS (
	SELECT t.guild_id, t.id, t.user_id AS opener
	FROM tickets t
	WHERE t.guild_id = $1
		AND ($2 = 0 OR t.open_time > NOW() - make_interval(days => $2))` + database.PanelPredicate("t", 4, 5) + `
),
answered AS (
	SELECT p.user_id, COUNT(DISTINCT p.ticket_id) AS cnt
	FROM participant p
	INNER JOIN scoped s ON p.guild_id = s.guild_id AND p.ticket_id = s.id
	WHERE p.user_id = ANY($3::int8[]) AND p.user_id != s.opener
	GROUP BY p.user_id
),
claimed AS (
	SELECT
		tc.user_id,
		COUNT(*) AS cnt,
		AVG(sr.rating)::float4 AS avg_rating,
		COUNT(sr.rating) AS rating_count
	FROM ticket_claims tc
	INNER JOIN scoped s ON tc.guild_id = s.guild_id AND tc.ticket_id = s.id
	LEFT JOIN service_ratings sr ON sr.guild_id = s.guild_id AND sr.ticket_id = s.id
	WHERE tc.user_id = ANY($3::int8[])
	GROUP BY tc.user_id
)
SELECT
	staff.user_id,
	COALESCE(a.cnt, 0) AS tickets_answered,
	COALESCE(c.cnt, 0) AS tickets_claimed,
	c.avg_rating,
	COALESCE(c.rating_count, 0) AS rating_count
FROM unnest($3::int8[]) AS staff(user_id)
LEFT JOIN answered a ON a.user_id = staff.user_id
LEFT JOIN claimed c ON c.user_id = staff.user_id
ORDER BY tickets_answered DESC, tickets_claimed DESC
LIMIT 50;`

	rows, err := dbclient.Client.Tickets.Query(timeoutCtx, query, guildId, days, staffIdArray, panelArr, panelUnassigned)
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

	if err := rows.Err(); err != nil {
		log.Logger.Error("Failed to read staff analytics rows", zap.Uint64("guild_id", guildId), zap.Error(err))
		ctx.JSON(500, utils.ErrorStr("Failed to retrieve staff analytics. Please try again later."))
		return
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
