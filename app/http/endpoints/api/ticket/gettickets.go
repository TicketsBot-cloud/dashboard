package api

import (
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/user"
	"github.com/gin-gonic/gin"
)

type (
	listTicketsResponse struct {
		Tickets       []ticketData              `json:"tickets"`
		PanelTitles   map[int]string            `json:"panel_titles"`
		ResolvedUsers map[uint64]user.User      `json:"resolved_users"`
		Labels        map[int][]ticketLabelData `json:"labels"`
		SelfId        uint64                    `json:"self_id,string"`
	}

	ticketData struct {
		TicketId            int        `json:"id"`
		PanelId             *int       `json:"panel_id"`
		UserId              uint64     `json:"user_id,string"`
		ClaimedBy           *uint64    `json:"claimed_by,string"`
		OpenedAt            time.Time  `json:"opened_at"`
		LastResponseTime    *time.Time `json:"last_response_time"`
		LastResponseIsStaff *bool      `json:"last_response_is_staff"`
	}
)

func GetTickets(c *gin.Context) {
	userId := c.Keys["userid"].(uint64)
	guildId := c.Keys["guildid"].(uint64)

	if c.Request.Method == "POST" {
		var queryOptions wrappedQueryOptions
		if bindErr := c.ShouldBindJSON(&queryOptions); bindErr == nil {
			opts, optsErr := queryOptions.toQueryOptions(guildId)
			if optsErr != nil {
				_ = c.AbortWithError(http.StatusBadRequest, app.NewError(optsErr, "Invalid filter parameters"))
				return
			}

			plainTickets, err := dbclient.Client.Tickets.GetByOptions(c, opts)
			if err != nil {
				_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch filtered tickets from database"))
				return
			}

			buildResponseFromPlainTickets(c, plainTickets, guildId, userId)
			return
		}
	}

	tickets, err := dbclient.Client.Tickets.GetGuildOpenTicketsWithMetadata(c, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch open tickets for guild from database"))
		return
	}

	panels, err := dbclient.Client.Panel.GetByGuild(c, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch panels for guild from database"))
		return
	}

	panelTitles := make(map[int]string)
	for _, panel := range panels {
		panelTitles[panel.PanelId] = panel.Title
	}

	// Get user objects
	userIds := make([]uint64, 0, int(float32(len(tickets))*1.5))
	for _, ticket := range tickets {
		userIds = append(userIds, ticket.Ticket.UserId)

		if ticket.ClaimedBy != nil {
			userIds = append(userIds, *ticket.ClaimedBy)
		}
	}

	users, err := cache.Instance.GetUsers(c, userIds)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch user information from cache"))
		return
	}

	// Fetch label data
	ticketIds := make([]int, len(tickets))
	for i, ticket := range tickets {
		ticketIds[i] = ticket.Id
	}

	labelsMap, err := fetchLabelsForTickets(c, guildId, ticketIds)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch label data"))
		return
	}

	data := make([]ticketData, len(tickets))
	for i, ticket := range tickets {
		data[i] = ticketData{
			TicketId:            ticket.Id,
			PanelId:             ticket.PanelId,
			UserId:              ticket.Ticket.UserId,
			ClaimedBy:           ticket.ClaimedBy,
			OpenedAt:            ticket.OpenTime,
			LastResponseTime:    ticket.LastMessageTime,
			LastResponseIsStaff: ticket.UserIsStaff,
		}
	}

	c.JSON(200, listTicketsResponse{
		Tickets:       data,
		PanelTitles:   panelTitles,
		ResolvedUsers: users,
		Labels:        labelsMap,
		SelfId:        userId,
	})
}

func buildResponseFromPlainTickets(c *gin.Context, plainTickets []database.Ticket, guildId, userId uint64) {
	if len(plainTickets) == 0 {
		c.JSON(200, listTicketsResponse{
			Tickets:       []ticketData{},
			PanelTitles:   make(map[int]string),
			ResolvedUsers: make(map[uint64]user.User),
			Labels:        make(map[int][]ticketLabelData),
			SelfId:        userId,
		})
		return
	}

	// Convert plain tickets to tickets with metadata by fetching metadata separately
	tickets := make([]database.TicketWithMetadata, len(plainTickets))
	for i, plainTicket := range plainTickets {
		// Start with the plain ticket
		tickets[i] = database.TicketWithMetadata{
			Ticket: plainTicket,
		}

		// Fetch claim information
		claimedByUserId, err := dbclient.Client.TicketClaims.Get(c, guildId, plainTicket.Id)
		if err == nil && claimedByUserId != 0 {
			tickets[i].ClaimedBy = &claimedByUserId
		}

		// Fetch last message information
		lastMsg, err := dbclient.Client.TicketLastMessage.Get(c, guildId, plainTicket.Id)
		if err == nil {
			tickets[i].TicketLastMessage = lastMsg
		}
	}

	panels, err := dbclient.Client.Panel.GetByGuild(c, guildId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch panels for guild from database"))
		return
	}

	panelTitles := make(map[int]string)
	for _, panel := range panels {
		panelTitles[panel.PanelId] = panel.Title
	}

	// Get user objects
	userIds := make([]uint64, 0, int(float32(len(tickets))*1.5))
	for _, ticket := range tickets {
		userIds = append(userIds, ticket.Ticket.UserId)

		if ticket.ClaimedBy != nil {
			userIds = append(userIds, *ticket.ClaimedBy)
		}
	}

	users, err := cache.Instance.GetUsers(c, userIds)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch user information from cache"))
		return
	}

	// Fetch label data
	ticketIds := make([]int, len(plainTickets))
	for i, ticket := range plainTickets {
		ticketIds[i] = ticket.Id
	}

	labelsMap, err := fetchLabelsForTickets(c, guildId, ticketIds)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch label data"))
		return
	}

	// Build ticketData from tickets with metadata
	data := make([]ticketData, len(tickets))
	for i, ticket := range tickets {
		data[i] = ticketData{
			TicketId:            ticket.Id,
			PanelId:             ticket.PanelId,
			UserId:              ticket.Ticket.UserId,
			ClaimedBy:           ticket.ClaimedBy,
			OpenedAt:            ticket.OpenTime,
			LastResponseTime:    ticket.LastMessageTime,
			LastResponseIsStaff: ticket.UserIsStaff,
		}
	}

	c.JSON(200, listTicketsResponse{
		Tickets:       data,
		PanelTitles:   panelTitles,
		ResolvedUsers: users,
		Labels:        labelsMap,
		SelfId:        userId,
	})
}

func fetchLabelsForTickets(c *gin.Context, guildId uint64, ticketIds []int) (map[int][]ticketLabelData, error) {
	if len(ticketIds) == 0 {
		return make(map[int][]ticketLabelData), nil
	}

	labelAssignments, err := dbclient.Client.TicketLabelAssignments.GetByTickets(c, guildId, ticketIds)
	if err != nil {
		return nil, err
	}

	allLabels, err := dbclient.Client.TicketLabels.GetByGuild(c, guildId)
	if err != nil {
		return nil, err
	}

	labelLookup := make(map[int]ticketLabelData)
	for _, l := range allLabels {
		labelLookup[l.LabelId] = ticketLabelData{
			LabelId: l.LabelId,
			Name:    l.Name,
			Colour:  l.Colour,
		}
	}

	result := make(map[int][]ticketLabelData)
	for ticketId, assignedIds := range labelAssignments {
		var resolved []ticketLabelData
		for _, lid := range assignedIds {
			if ld, exists := labelLookup[lid]; exists {
				resolved = append(resolved, ld)
			}
		}
		if resolved == nil {
			resolved = []ticketLabelData{}
		}
		result[ticketId] = resolved
	}

	return result, nil
}
