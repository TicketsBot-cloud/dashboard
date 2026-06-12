package onboarding

import (
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type updateBody struct {
	CurrentStep *int16 `json:"current_step"`
	Completed   *bool  `json:"completed"`
	Skipped     *bool  `json:"skipped"`
}

func GetOnboardingHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	state, err := dbclient.Client.DashboardOnboarding.Get(ctx, guildId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to fetch onboarding state"))
		return
	}

	ctx.JSON(http.StatusOK, state)
}

func UpdateOnboardingHandler(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	var body updateBody
	if err := ctx.BindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid request body"))
		return
	}

	if body.Completed != nil && *body.Completed {
		if err := dbclient.Client.DashboardOnboarding.Complete(ctx, guildId); err != nil {
			ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to update onboarding state"))
			return
		}

		audit.Log(audit.LogEntry{
			GuildId:      audit.Uint64Ptr(guildId),
			UserId:       userId,
			ActionType:   database.AuditActionOnboardingComplete,
			ResourceType: database.AuditResourceOnboarding,
		})
	}

	if body.Skipped != nil && *body.Skipped {
		if err := dbclient.Client.DashboardOnboarding.Skip(ctx, guildId); err != nil {
			ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to update onboarding state"))
			return
		}

		audit.Log(audit.LogEntry{
			GuildId:      audit.Uint64Ptr(guildId),
			UserId:       userId,
			ActionType:   database.AuditActionOnboardingSkip,
			ResourceType: database.AuditResourceOnboarding,
		})
	}

	if body.CurrentStep != nil {
		if *body.CurrentStep < 0 || *body.CurrentStep > 5 {
			ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid step number"))
			return
		}

		if err := dbclient.Client.DashboardOnboarding.SetStep(ctx, guildId, *body.CurrentStep); err != nil {
			ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to update onboarding state"))
			return
		}
	}

	ctx.JSON(http.StatusOK, gin.H{"success": true})
}
