package utils

import (
	"net/http"

	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/app"
	dbclient "github.com/ticketsbot-cloud/dashboard/backend/database"
)

type submissionBlacklistKey struct {
	feature    database.SubmissionFeature
	targetType database.SubmissionTargetType
}

var submissionBlacklistMessages = map[submissionBlacklistKey]string{
	{database.SubmissionFeatureGallery, database.SubmissionTargetUser}:      "You are blacklisted from submitting to the gallery",
	{database.SubmissionFeatureGallery, database.SubmissionTargetGuild}:     "This server is blacklisted from submitting to the gallery",
	{database.SubmissionFeatureIntegrations, database.SubmissionTargetUser}: "You are blacklisted from submitting integrations for public review",
}

func RejectIfSubmissionBlacklisted(ctx *gin.Context, feature database.SubmissionFeature, userId, guildId uint64) bool {
	blacklisted, targetType, err := dbclient.Client.SubmissionBlacklist.IsBlacklisted(ctx, feature, userId, guildId)
	if err != nil {
		_ = ctx.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to process request. Please try again."))
		return true
	}

	if blacklisted {
		ctx.JSON(http.StatusForbidden, ErrorStr("%s", submissionBlacklistMessages[submissionBlacklistKey{feature, targetType}]))
		return true
	}

	return false
}
