package api

import (
	"context"
	"errors"

	"github.com/TicketsBot-cloud/dashboard/botcontext"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	cache2 "github.com/TicketsBot-cloud/gdl/cache"
	"github.com/gin-gonic/gin"
)

const pageLimit = 15

type transcriptLabelData struct {
	LabelId int    `json:"label_id"`
	Name    string `json:"name"`
	Colour  int32  `json:"colour"`
}

type transcriptMetadata struct {
	TicketId      int                   `json:"ticket_id"`
	Username      string                `json:"username"`
	CloseReason   *string               `json:"close_reason"`
	ClosedBy      *uint64               `json:"closed_by"`
	Rating        *uint8                `json:"rating"`
	HasTranscript bool                  `json:"has_transcript"`
	Labels        []transcriptLabelData `json:"labels"`
}

type paginatedTranscripts struct {
	Transcripts []transcriptMetadata `json:"transcripts"`
	TotalCount  int                   `json:"total_count"`
	TotalPages  int                   `json:"total_pages"`
	CurrentPage int                   `json:"current_page"`
}

func ListTranscripts(ctx *gin.Context) {
	guildId := ctx.Keys["guildid"].(uint64)

	var queryOptions wrappedQueryOptions
	if err := ctx.ShouldBindJSON(&queryOptions); err != nil {
		ctx.JSON(400, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	opts, err := queryOptions.toQueryOptions(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	tickets, err := dbclient.Client.Tickets.GetByOptions(ctx, opts)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Invalid request data. Please check your input and try again."))
		return
	}

	botContext, err := botcontext.ContextForGuild(guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Unable to connect to Discord. Please try again later."))
		return
	}

	// Create a mapping user_id -> username so we can skip duplicates
	usernames := make(map[uint64]string)
	for _, ticket := range tickets {
		if _, ok := usernames[ticket.UserId]; ok {
			continue // don't fetch again
		}

		// check cache, for some reason botContext.GetUser doesn't do this
		user, err := cache.Instance.GetUser(context.Background(), ticket.UserId)
		if err == nil {
			usernames[ticket.UserId] = user.Username
		} else if errors.Is(err, cache2.ErrNotFound) {
			user, err = botContext.GetUser(context.Background(), ticket.UserId)
			if err != nil { // TODO: Log
				usernames[ticket.UserId] = "Unknown User"
			} else {
				usernames[ticket.UserId] = user.Username
			}
		} else {
			ctx.JSON(500, utils.ErrorStr("Failed to fetch records. Please try again."))
			return
		}
	}

	// Get ratings
	ticketIds := make([]int, len(tickets))
	for i, ticket := range tickets {
		ticketIds[i] = ticket.Id
	}

	ratings, err := dbclient.Client.ServiceRatings.GetMulti(ctx, guildId, ticketIds)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch records. Please try again."))
		return
	}

	// Get close reasons
	closeReasons, err := dbclient.Client.CloseReason.GetMulti(ctx, guildId, ticketIds)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch records. Please try again."))
		return
	}

	// Get label assignments
	labelAssignments, err := dbclient.Client.TicketLabelAssignments.GetByTickets(ctx, guildId, ticketIds)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch records. Please try again."))
		return
	}

	// Get all guild labels for name resolution
	allLabels, err := dbclient.Client.TicketLabels.GetByGuild(ctx, guildId)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch records. Please try again."))
		return
	}

	labelMap := make(map[int]transcriptLabelData)
	for _, l := range allLabels {
		labelMap[l.LabelId] = transcriptLabelData{
			LabelId: l.LabelId,
			Name:    l.Name,
			Colour:  l.Colour,
		}
	}

	transcripts := make([]transcriptMetadata, len(tickets))
	for i, ticket := range tickets {
		transcript := transcriptMetadata{
			TicketId:      ticket.Id,
			Username:      usernames[ticket.UserId],
			HasTranscript: ticket.HasTranscript,
		}

		if v, ok := ratings[ticket.Id]; ok {
			transcript.Rating = &v
		}

		if v, ok := closeReasons[ticket.Id]; ok {
			transcript.CloseReason = v.Reason
			transcript.ClosedBy = v.ClosedBy
		}

		if assignedIds, ok := labelAssignments[ticket.Id]; ok {
			for _, lid := range assignedIds {
				if ld, exists := labelMap[lid]; exists {
					transcript.Labels = append(transcript.Labels, ld)
				}
			}
		}
		if transcript.Labels == nil {
			transcript.Labels = []transcriptLabelData{}
		}

		transcripts[i] = transcript
	}

	// Get total count for pagination
	totalCount, err := dbclient.Client.Tickets.CountByOptions(ctx, opts)
	if err != nil {
		ctx.JSON(500, utils.ErrorStr("Failed to fetch total count. Please try again."))
		return
	}

	// Calculate total pages
	totalPages := (totalCount + pageLimit - 1) / pageLimit
	if totalPages == 0 {
		totalPages = 1 // At least 1 page even if empty
	}

	// Get current page from query options
	currentPage := queryOptions.Page
	if currentPage == 0 {
		currentPage = 1
	}

	response := paginatedTranscripts{
		Transcripts: transcripts,
		TotalCount:  totalCount,
		TotalPages:  totalPages,
		CurrentPage: currentPage,
	}

	ctx.JSON(200, response)
}
