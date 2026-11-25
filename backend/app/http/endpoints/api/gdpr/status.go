package gdpr

import (
	"cmp"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/TicketsBot-cloud/common/gdprrelay"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/guild"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/redis"
	"github.com/ticketsbot-cloud/dashboard/backend/rpc/cache"
	"golang.org/x/sync/errgroup"
)

type gdprGuild struct {
	Id   uint64 `json:"id,string"`
	Name string `json:"name"`
}

type statusResponse struct {
	WorkerOnline bool `json:"worker_online"`
	NextExportAt struct {
		Server *time.Time `json:"server"`
		User   *time.Time `json:"user"`
	} `json:"next_export_at"`
	OwnedGuilds           []gdprGuild `json:"owned_guilds"`
	OwnedTranscriptGuilds []gdprGuild `json:"owned_transcript_guilds"`
	TranscriptGuilds      []gdprGuild `json:"transcript_guilds"`
}

func GetStatus(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	var res statusResponse
	var owned, ownedWithTranscripts []uint64
	var refs []database.TranscriptRef

	group, groupCtx := errgroup.WithContext(ctx)

	group.Go(func() (err error) {
		if owned, err = cache.Instance.GetGuildIdsByOwner(groupCtx, userId); err != nil {
			return
		}

		ownedWithTranscripts, err = dbclient.Client.Tickets.GuildsWithClosedTranscripts(groupCtx, owned)
		return
	})

	group.Go(func() (err error) {
		refs, err = dbclient.Client.Tickets.GetUserTranscriptRefs(groupCtx, userId)
		return
	})

	group.Go(func() (err error) {
		res.NextExportAt.Server, err = dbclient.Client.GdprExports.NextAllowedAt(groupCtx, userId, database.GdprExportTypeServer)
		return
	})

	group.Go(func() (err error) {
		res.NextExportAt.User, err = dbclient.Client.GdprExports.NextAllowedAt(groupCtx, userId, database.GdprExportTypeUser)
		return
	})

	if err := group.Wait(); err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to query database. Please try again."))
		return
	}

	transcriptGuilds := database.TranscriptRefGuildIds(refs)

	guilds, err := cache.Instance.GetGuilds(ctx, slices.Concat(owned, transcriptGuilds))
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to query database. Please try again."))
		return
	}

	res.WorkerOnline = gdprrelay.IsWorkerAlive(redis.Client.Client)
	res.OwnedGuilds = toGdprGuilds(owned, guilds)
	res.OwnedTranscriptGuilds = toGdprGuilds(ownedWithTranscripts, guilds)
	res.TranscriptGuilds = toGdprGuilds(transcriptGuilds, guilds)

	ctx.JSON(http.StatusOK, res)
}

func toGdprGuilds(ids []uint64, known map[uint64]guild.Guild) []gdprGuild {
	guilds := make([]gdprGuild, len(ids))
	for i, id := range ids {
		guilds[i] = gdprGuild{Id: id, Name: strconv.FormatUint(id, 10)}
		if g, ok := known[id]; ok && g.Name != "" {
			guilds[i].Name = g.Name
		}
	}

	slices.SortFunc(guilds, func(a, b gdprGuild) int {
		return cmp.Or(strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name)), cmp.Compare(a.Id, b.Id))
	})

	return guilds
}
