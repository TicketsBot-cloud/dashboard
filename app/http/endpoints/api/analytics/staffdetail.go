package api_analytics

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/log"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
)

type staffDetailResponse struct {
	UserId               uint64                  `json:"user_id,string"`
	Username             string                  `json:"username"`
	Avatar               string                  `json:"avatar"`
	FirstResponseTime    tripleWindowSeconds     `json:"first_response_time"`
	AverageRating        *float32                `json:"average_rating"`
	RatingCount          int                     `json:"rating_count"`
	FeedbackDistribution [5]int                  `json:"feedback_distribution"`
	TicketsClaimed       staffDetailTripleWindow `json:"tickets_claimed"`
	TicketsAnswered      staffDetailTripleWindow `json:"tickets_answered"`
	GuildTotalTickets    staffDetailTripleWindow `json:"guild_total_tickets"`
	OpenClaimedCount     int                     `json:"open_claimed_count"`
}

type staffDetailTripleWindow struct {
	AllTime int `json:"all_time"`
	Monthly int `json:"monthly"`
	Weekly  int `json:"weekly"`
}

func GetAnalyticsStaffDetailHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	userIdStr := ctx.Param("userid")
	userId, err := strconv.ParseUint(userIdStr, 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var resp staffDetailResponse
	resp.UserId = userId

	var frtAllTime, frtMonthly, frtWeekly *time.Duration

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	group, groupCtx := errgroup.WithContext(timeoutCtx)

	// First response time - all time
	group.Go(func() (err error) {
		frtAllTime, err = dbclient.Client.FirstResponseTime.GetAverageAllTimeUser(groupCtx, guildId, userId)
		return
	})

	// First response time - monthly (28 days)
	group.Go(func() (err error) {
		frtMonthly, err = dbclient.Client.FirstResponseTime.GetAverageUser(groupCtx, guildId, userId, time.Hour*24*28)
		return
	})

	// First response time - weekly (7 days)
	group.Go(func() (err error) {
		frtWeekly, err = dbclient.Client.FirstResponseTime.GetAverageUser(groupCtx, guildId, userId, time.Hour*24*7)
		return
	})

	// Average rating
	group.Go(func() error {
		avg, err := dbclient.Client.ServiceRatings.GetAverageClaimedBy(groupCtx, guildId, userId)
		if err != nil {
			return err
		}
		if avg > 0 {
			resp.AverageRating = &avg
		}
		return nil
	})

	// Rating count
	group.Go(func() error {
		count, err := dbclient.Client.ServiceRatings.GetCountClaimedBy(groupCtx, guildId, userId)
		if err != nil {
			return err
		}
		resp.RatingCount = count
		return nil
	})

	// Feedback distribution
	group.Go(func() (err error) {
		resp.FeedbackDistribution, err = dbclient.Client.ServiceRatings.GetDistributionClaimedBy(groupCtx, guildId, userId)
		return
	})

	// Tickets claimed - all time
	group.Go(func() error {
		count, err := dbclient.Client.TicketClaims.GetClaimedCount(groupCtx, guildId, userId)
		if err != nil {
			return err
		}
		resp.TicketsClaimed.AllTime = count
		return nil
	})

	// Tickets claimed - monthly
	group.Go(func() error {
		count, err := dbclient.Client.TicketClaims.GetClaimedSinceCount(groupCtx, guildId, userId, time.Hour*24*28)
		if err != nil {
			return err
		}
		resp.TicketsClaimed.Monthly = count
		return nil
	})

	// Tickets claimed - weekly
	group.Go(func() error {
		count, err := dbclient.Client.TicketClaims.GetClaimedSinceCount(groupCtx, guildId, userId, time.Hour*24*7)
		if err != nil {
			return err
		}
		resp.TicketsClaimed.Weekly = count
		return nil
	})

	// Tickets answered - all time
	group.Go(func() error {
		count, err := dbclient.Client.Participants.GetParticipatedCount(groupCtx, guildId, userId)
		if err != nil {
			return err
		}
		resp.TicketsAnswered.AllTime = count
		return nil
	})

	// Tickets answered - monthly
	group.Go(func() error {
		count, err := dbclient.Client.Participants.GetParticipatedCountInterval(groupCtx, guildId, userId, time.Hour*24*28)
		if err != nil {
			return err
		}
		resp.TicketsAnswered.Monthly = count
		return nil
	})

	// Tickets answered - weekly
	group.Go(func() error {
		count, err := dbclient.Client.Participants.GetParticipatedCountInterval(groupCtx, guildId, userId, time.Hour*24*7)
		if err != nil {
			return err
		}
		resp.TicketsAnswered.Weekly = count
		return nil
	})

	// Guild total tickets - all time
	group.Go(func() error {
		count, err := dbclient.Client.Tickets.GetTotalTicketCount(groupCtx, guildId)
		if err != nil {
			return err
		}
		resp.GuildTotalTickets.AllTime = count
		return nil
	})

	// Guild total tickets - monthly
	group.Go(func() error {
		count, err := dbclient.Client.Tickets.GetTotalTicketCountInterval(groupCtx, guildId, time.Hour*24*28)
		if err != nil {
			return err
		}
		resp.GuildTotalTickets.Monthly = count
		return nil
	})

	// Guild total tickets - weekly
	group.Go(func() error {
		count, err := dbclient.Client.Tickets.GetTotalTicketCountInterval(groupCtx, guildId, time.Hour*24*7)
		if err != nil {
			return err
		}
		resp.GuildTotalTickets.Weekly = count
		return nil
	})

	// Open claimed count
	group.Go(func() error {
		count, err := dbclient.Client.TicketClaims.GetOpenClaimedCount(groupCtx, guildId, userId)
		if err != nil {
			return err
		}
		resp.OpenClaimedCount = count
		return nil
	})

	if err := group.Wait(); err != nil {
		log.Logger.Error("Failed to retrieve staff detail analytics", zap.Uint64("guild_id", guildId), zap.Uint64("user_id", userId), zap.Error(err))
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to retrieve staff analytics. Please try again later."))
		return
	}

	resp.FirstResponseTime = tripleWindowSeconds{
		AllTime: durationToSeconds(frtAllTime),
		Monthly: durationToSeconds(frtMonthly),
		Weekly:  durationToSeconds(frtWeekly),
	}

	// Resolve username from cache
	users, err := cache.Instance.GetUsers(timeoutCtx, []uint64{userId})
	if err != nil {
		log.Logger.Warn("Failed to resolve user data for staff detail", zap.Error(err))
	} else if u, ok := users[userId]; ok {
		resp.Username = u.Username
		resp.Avatar = u.AvatarUrl(256)
	}

	ctx.JSON(200, resp)
}
