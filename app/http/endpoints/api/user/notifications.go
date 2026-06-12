package user

import (
	"net/http"
	"strconv"

	"github.com/TicketsBot-cloud/dashboard/app/http/audit"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

const (
	defaultPerPage = 25
	maxPerPage     = 100
)

type notificationResponse struct {
	Id        int64  `json:"id"`
	Category  string `json:"category"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Link      *string `json:"link"`
	Read      bool   `json:"read"`
	CreatedAt string `json:"created_at"`
}

type listNotificationsResponse struct {
	Notifications []notificationResponse `json:"notifications"`
	Total         int                    `json:"total"`
	Page          int                    `json:"page"`
	PerPage       int                    `json:"per_page"`
}

// ListNotifications handles GET /user/notifications
func ListNotifications(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	page, _ := strconv.Atoi(ctx.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}

	perPage, _ := strconv.Atoi(ctx.DefaultQuery("per_page", strconv.Itoa(defaultPerPage)))
	if perPage < 1 {
		perPage = defaultPerPage
	}
	if perPage > maxPerPage {
		perPage = maxPerPage
	}

	var categoryPtr *string
	if cat := ctx.Query("category"); cat != "" {
		categoryPtr = &cat
	}

	offset := (page - 1) * perPage

	group, groupCtx := errgroup.WithContext(ctx)

	var notifications []database.Notification
	var total int

	group.Go(func() error {
		var err error
		notifications, err = dbclient.Client.Notifications.ListByUserId(groupCtx, userId, categoryPtr, perPage, offset)
		return err
	})

	group.Go(func() error {
		var err error
		total, err = dbclient.Client.Notifications.CountByUserId(groupCtx, userId, categoryPtr)
		return err
	})

	if err := group.Wait(); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	items := make([]notificationResponse, 0, len(notifications))
	for _, n := range notifications {
		items = append(items, notificationResponse{
			Id:        n.Id,
			Category:  n.Category,
			Title:     n.Title,
			Body:      n.Body,
			Link:      n.Link,
			Read:      n.Read,
			CreatedAt: n.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	ctx.JSON(http.StatusOK, listNotificationsResponse{
		Notifications: items,
		Total:         total,
		Page:          page,
		PerPage:       perPage,
	})
}

// UnreadCount handles GET /user/notifications/unread-count
func UnreadCount(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	count, err := dbclient.Client.Notifications.CountUnreadByUserId(ctx, userId)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to query database. Please try again."))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"count": count})
}

// MarkNotificationRead handles POST /user/notifications/:id/read
func MarkNotificationRead(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	notificationId, err := strconv.ParseInt(ctx.Param("id"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, utils.ErrorStr("Invalid notification ID."))
		return
	}

	if err := dbclient.Client.Notifications.MarkAsRead(ctx, notificationId, userId); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to update notification. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionNotificationMarkRead,
		ResourceType: database.AuditResourceNotification,
		ResourceId:   audit.StringPtr(strconv.FormatInt(notificationId, 10)),
	})

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}

// MarkAllNotificationsRead handles POST /user/notifications/read-all
func MarkAllNotificationsRead(ctx *gin.Context) {
	userId := ctx.Keys["userid"].(uint64)

	if err := dbclient.Client.Notifications.MarkAllAsRead(ctx, userId); err != nil {
		ctx.JSON(http.StatusInternalServerError, utils.ErrorStr("Failed to update notifications. Please try again."))
		return
	}

	audit.Log(audit.LogEntry{
		UserId:       userId,
		ActionType:   database.AuditActionNotificationMarkAllRead,
		ResourceType: database.AuditResourceNotification,
	})

	ctx.JSON(http.StatusOK, utils.SuccessResponse)
}
