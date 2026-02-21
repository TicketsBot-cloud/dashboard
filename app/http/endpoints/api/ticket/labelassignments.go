package api

import (
	"fmt"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
)

type setLabelsBody struct {
	LabelIds []int `json:"label_ids"`
}

func GetTicketLabels(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	ticketId, err := strconv.Atoi(ctx.Param("ticketId"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid ticket ID."))
		return
	}

	labelIds, err := dbclient.Client.TicketLabelAssignments.GetByTicket(ctx, guildId, ticketId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch labels. Please try again."))
		return
	}

	if labelIds == nil {
		labelIds = []int{}
	}

	ctx.JSON(200, gin.H{"label_ids": labelIds})
}

func SetTicketLabels(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	ticketId, err := strconv.Atoi(ctx.Param("ticketId"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid ticket ID."))
		return
	}

	var body setLabelsBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request body."))
		return
	}

	if len(body.LabelIds) > maxLabelsPerGuild {
		ctx.JSON(400, utils.ErrorStr("Too many labels."))
		return
	}

	// Validate that all label IDs belong to this guild
	if len(body.LabelIds) > 0 {
		labels, err := dbclient.Client.TicketLabels.GetByGuild(ctx, guildId)
		if err != nil {
			ctx.JSON(500, utils.ErrorStr("Failed to update labels. Please try again."))
			return
		}

		validIds := make(map[int]bool)
		for _, l := range labels {
			validIds[l.LabelId] = true
		}

		for _, id := range body.LabelIds {
			if !validIds[id] {
				ctx.JSON(400, utils.ErrorStr(fmt.Sprintf("Label ID %d does not exist.", id)))
				return
			}
		}
	}

	if err := dbclient.Client.TicketLabelAssignments.Replace(ctx, guildId, ticketId, body.LabelIds); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to update labels. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionTicketLabelAssign,
		ResourceType: database.AuditResourceTicketLabelAssignment,
		ResourceId:   audit.StringPtr(strconv.Itoa(ticketId)),
		NewData:      body.LabelIds,
	})

	ctx.JSON(200, gin.H{"label_ids": body.LabelIds})
}

func RemoveTicketLabel(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	ticketId, err := strconv.Atoi(ctx.Param("ticketId"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid ticket ID."))
		return
	}

	labelId, err := strconv.Atoi(ctx.Param("labelid"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid label ID."))
		return
	}

	if err := dbclient.Client.TicketLabelAssignments.Delete(ctx, guildId, ticketId, labelId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to remove label. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionTicketLabelUnassign,
		ResourceType: database.AuditResourceTicketLabelAssignment,
		ResourceId:   audit.StringPtr(fmt.Sprintf("%d:%d", ticketId, labelId)),
	})

	ctx.JSON(204, nil)
}
