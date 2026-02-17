package api

import (
	"net/http"
	"time"

	"github.com/TicketsBot-cloud/dashboard/app"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/rpc/cache"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/user"
	"github.com/gin-gonic/gin"
)

type (
	listTicketsResponse struct {
		Tickets       []ticketData         `json:"tickets"`
		PanelTitles   map[int]string       `json:"panel_titles"`
		ResolvedUsers map[uint64]user.User `json:"resolved_users"`
		SelfId        uint64               `json:"self_id,string"`
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

	// Check if user is a panel team member only (not admin or guild-wide support)
	isPanelTeamOnly, err := utils.IsPanelTeamMemberOnly(c, guildId, userId)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to check user permissions"))
		return
	}

	// Get accessible panels for panel team members
	var panelIds []int
	if isPanelTeamOnly {
		panelIds, err = utils.GetAccessiblePanelIds(c, guildId, userId)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to get accessible panels"))
			return
		}
	}

	if c.Request.Method == "POST" {
		var queryOptions wrappedQueryOptions
		if bindErr := c.ShouldBindJSON(&queryOptions); bindErr == nil {
			opts, optsErr := queryOptions.toQueryOptions(guildId)
			if optsErr != nil {
				_ = c.AbortWithError(http.StatusBadRequest, app.NewError(optsErr, "Invalid filter parameters"))
				return
			}

			// Apply panel team member filtering if needed
			if isPanelTeamOnly {
				opts.FilterByPanelIds = panelIds
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

	// For GET requests, if user is panel team only, convert to use GetByOptions with filter
	if isPanelTeamOnly {
		openTrue := true
		opts := database.TicketQueryOptions{
			GuildId:          guildId,
			Open:             &openTrue,
			FilterByPanelIds: panelIds,
		}

		plainTickets, err := dbclient.Client.Tickets.GetByOptions(c, opts)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch open tickets for guild from database"))
			return
		}

		buildResponseFromPlainTickets(c, plainTickets, guildId, userId)
		return
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
		SelfId:        userId,
	})
}

func buildResponseFromPlainTickets(c *gin.Context, plainTickets []database.Ticket, guildId, userId uint64) {
	if len(plainTickets) == 0 {
		c.JSON(200, listTicketsResponse{
			Tickets:       []ticketData{},
			PanelTitles:   make(map[int]string),
			ResolvedUsers: make(map[uint64]user.User),
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
		SelfId:        userId,
	})
}
