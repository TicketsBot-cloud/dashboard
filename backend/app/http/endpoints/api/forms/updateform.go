package forms

import (
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/TicketsBot-cloud/common/featureflags"
	dbmodel "github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	"github.com/ticketsbot-cloud/dashboard/backend/app/http/audit"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func UpdateForm(c *gin.Context) {
	guildId := c.Keys["guildid"].(uint64)
	userId := c.Keys["userid"].(uint64)

	if !utils.FeatureFlags.IsEnabled(c, "202608_FEATURE_FORMS", featureflags.ForDashboardUser(userId).WithGuild(guildId)) {
		c.JSON(http.StatusServiceUnavailable, utils.ErrorStr("Form management is temporarily unavailable. Please try again shortly."))
		return
	}

	var data createFormBody
	if err := c.ShouldBindJSON(&data); err != nil {
		c.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	// Validate title is not empty or whitespace-only
	if len(strings.TrimSpace(data.Title)) == 0 {
		c.JSON(400, utils.ErrorStr("Form title cannot be empty"))
		return
	}

	if utf8.RuneCountInString(data.Title) > 45 {
		c.JSON(400, utils.ErrorStr("Form title must be 45 characters or less (current: %d characters)", utf8.RuneCountInString(data.Title)))
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

	if err := dbclient.Client.Forms.UpdateTitle(c, formId, data.Title); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to update form title in database"))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   dbmodel.AuditActionFormUpdate,
		ResourceType: dbmodel.AuditResourceForm,
		ResourceId:   audit.StringPtr(strconv.Itoa(formId)),
		OldData:      form,
		NewData:      data,
	})
	c.JSON(200, utils.SuccessResponse)
}
