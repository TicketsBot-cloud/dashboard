package forms

import (
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/common/featureflags"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func DeleteForm(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	if !utils.FeatureFlags.IsEnabled(c, "202608_FEATURE_FORMS", featureflags.ForDashboardUser(userId).WithGuild(guildId)) {
		c.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Form management is temporarily unavailable. Please try again shortly."))
		return
	}

	formId, err := strconv.Atoi(c.Param("form-id"))
	if err != nil {
		c.JSON(400, utils.ErrorStr("Invalid form ID provided: %s", c.Param("form-id")))
		return
	}

	form, ok, err := dbclient.Client.Forms.Get(c, formId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch form from database"))
		return
	}

	if !ok {
		c.JSON(404, utils.ErrorStr("Form #%d not found", formId))
		return
	}

	if form.GuildId != guildId {
		c.JSON(403, utils.ErrorStr("Form #%d does not belong to guild %d", formId, guildId))
		return
	}

	if err := dbclient.Client.Forms.Delete(c, formId); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to delete form from database"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionFormDelete,
		ResourceType: dbmodel.AuditResourceForm,
		ResourceId:   audit.StringPtr(strconv.Itoa(formId)),
		OldData:      form,
	})
	c.JSON(200, utils.SuccessResponse)
}
