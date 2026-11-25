package gdpr

import (
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	commonutils "github.com/TicketsBot-cloud/common/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

var downloadErrors = map[int]string{
	http.StatusNotFound: "This export doesn't exist or has expired.",
	http.StatusConflict: "This export isn't ready to download.",
	http.StatusGone:     "This export has expired.",
}

func DownloadExport(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	exportId, err := strconv.ParseInt(ctx.Param("id"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid export ID."))
		return
	}

	if utils.ExportS3 == nil {
		ctx.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Export downloads aren't available right now."))
		return
	}

	export, err := dbclient.Client.GdprExports.Get(ctx, exportId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch records. Please try again."))
		return
	}

	if status := exportDownloadError(export, userId, time.Now()); status != 0 {
		ctx.JSON(status, utils.ErrorStr("%s", downloadErrors[status]))
		return
	}

	if export.Type == database.GdprExportTypeServer {
		_, notOwned, unreachable, err := commonutils.SplitOwnedGuilds(ctx, userId, export.GuildIds, utils.GetGuildLive)
		if err != nil {
			_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Unable to connect to Discord. Please try again later."))
			return
		}

		if len(notOwned) > 0 || len(unreachable) > 0 {
			ctx.JSON(http.StatusForbidden, utils.ErrorStr("We couldn't confirm you still own every server in this export."))
			return
		}
	}

	name := string(export.Type)
	if export.Type == database.GdprExportTypeUser {
		name = "personal"
	}

	disposition := fmt.Sprintf(`attachment; filename="tickets-%s-export-%d.zip"`, name, export.Id)
	presigned, err := utils.ExportS3.PresignedGetObject(ctx, config.Conf.ExportS3.Bucket, *export.ObjectKey, 5*time.Minute, url.Values{
		"response-content-disposition": {disposition},
	})
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to create the download link. Please try again."))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"url": presigned.String()})
}

func exportDownloadError(export *database.GdprExport, userId uint64, now time.Time) int {
	switch {
	case export == nil || export.RequesterId != userId:
		return http.StatusNotFound
	case export.Status != database.GdprExportStatusReady || export.ObjectKey == nil:
		return http.StatusConflict
	case !now.Before(export.ExpiresAt):
		return http.StatusGone
	default:
		return 0
	}
}
