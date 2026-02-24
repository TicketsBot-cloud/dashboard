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

const maxLabelsPerGuild = 50

type createLabelBody struct {
	Name   string `json:"name"`
	Colour int32  `json:"colour"`
}

type updateLabelBody struct {
	Name   string `json:"name"`
	Colour int32  `json:"colour"`
}

type ticketLabelData struct {
	LabelId int    `json:"label_id"`
	Name    string `json:"name"`
	Colour  int32  `json:"colour"`
}

func ListTicketLabels(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	labels, err := dbclient.Client.TicketLabels.GetByGuild(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch labels. Please try again."))
		return
	}

	if labels == nil {
		labels = []database.TicketLabel{}
	}

	ctx.JSON(200, labels)
}

func CreateTicketLabel(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	var body createLabelBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request body."))
		return
	}

	if len(body.Name) < 1 || len(body.Name) > 32 {
		ctx.JSON(400, utils.ErrorStr("Label name must be between 1 and 32 characters."))
		return
	}

	if body.Colour < 0 || body.Colour > 0xFFFFFF {
		ctx.JSON(400, utils.ErrorStr("Invalid colour value."))
		return
	}

	count, err := dbclient.Client.TicketLabels.GetCount(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to create label. Please try again."))
		return
	}

	if count >= maxLabelsPerGuild {
		ctx.JSON(400, utils.ErrorStr(fmt.Sprintf("You can only have up to %d labels per server.", maxLabelsPerGuild)))
		return
	}

	labelId, err := dbclient.Client.TicketLabels.Create(ctx, guildId, body.Name, body.Colour)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to create label. The name may already be in use."))
		return
	}

	newLabel := database.TicketLabel{
		GuildId: guildId,
		LabelId: labelId,
		Name:    body.Name,
		Colour:  body.Colour,
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionTicketLabelCreate,
		ResourceType: database.AuditResourceTicketLabel,
		ResourceId:   audit.StringPtr(strconv.Itoa(labelId)),
		NewData:      newLabel,
	})

	ctx.JSON(200, newLabel)
}

func UpdateTicketLabel(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	labelId, err := strconv.Atoi(ctx.Param("labelid"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid label ID."))
		return
	}

	var body updateLabelBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request body."))
		return
	}

	if len(body.Name) < 1 || len(body.Name) > 32 {
		ctx.JSON(400, utils.ErrorStr("Label name must be between 1 and 32 characters."))
		return
	}

	if body.Colour < 0 || body.Colour > 0xFFFFFF {
		ctx.JSON(400, utils.ErrorStr("Invalid colour value."))
		return
	}

	existing, ok, err := dbclient.Client.TicketLabels.Get(ctx, guildId, labelId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to update label. Please try again."))
		return
	}

	if !ok {
		ctx.JSON(404, utils.ErrorStr("Label not found."))
		return
	}

	if err := dbclient.Client.TicketLabels.Update(ctx, guildId, labelId, body.Name, body.Colour); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to update label. The name may already be in use."))
		return
	}

	newLabel := database.TicketLabel{
		GuildId: guildId,
		LabelId: labelId,
		Name:    body.Name,
		Colour:  body.Colour,
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionTicketLabelUpdate,
		ResourceType: database.AuditResourceTicketLabel,
		ResourceId:   audit.StringPtr(strconv.Itoa(labelId)),
		OldData:      existing,
		NewData:      newLabel,
	})

	ctx.JSON(200, newLabel)
}

func DeleteTicketLabel(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)
	userId := ctx.Keys["userid"].(uint64)

	labelId, err := strconv.Atoi(ctx.Param("labelid"))
	if err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid label ID."))
		return
	}

	existing, ok, err := dbclient.Client.TicketLabels.Get(ctx, guildId, labelId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete label. Please try again."))
		return
	}

	if !ok {
		ctx.JSON(404, utils.ErrorStr("Label not found."))
		return
	}

	if err := dbclient.Client.TicketLabels.Delete(ctx, guildId, labelId); err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to delete label. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		GuildId:      audit.Uint64Ptr(guildId),
		UserId:       userId,
		ActionType:   database.AuditActionTicketLabelDelete,
		ResourceType: database.AuditResourceTicketLabel,
		ResourceId:   audit.StringPtr(strconv.Itoa(labelId)),
		OldData:      existing,
	})

	ctx.JSON(204, nil)
}
