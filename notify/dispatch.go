package notify

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/TicketsBot-cloud/dashboard/config"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"

	"github.com/TicketsBot-cloud/dashboard/email"
	"github.com/TicketsBot-cloud/dashboard/redis"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/ratelimit"
)

var (
	discordRL     *ratelimit.Ratelimiter
	discordRLOnce sync.Once
)

func getDiscordRateLimiter() *ratelimit.Ratelimiter {
	discordRLOnce.Do(func() {
		if redis.Client != nil {
			discordRL = ratelimit.NewRateLimiter(ratelimit.NewRedisStore(redis.Client.Client, "ratelimiter:notify"), 1)
		}
	})
	return discordRL
}

// Send dispatches a notification to a single user based on their preferences.
// If no preferences are found for the given category, defaults are used:
// in_app=true, discord_dm=false, email=false.
func Send(ctx context.Context, userId uint64, category, title, body, link string) {
	pref, err := dbclient.Client.NotificationPreferences.GetByUserIdAndCategory(ctx, userId, category)
	if err != nil {
		log.Printf("Failed to look up notification preferences for user %d: %v", userId, err)
		// Fall through with defaults
	}

	inApp := true
	discordDm := false
	sendEmail := false

	if pref != nil {
		inApp = pref.InApp
		discordDm = pref.DiscordDm
		sendEmail = pref.Email
	}

	var linkPtr *string
	if link != "" {
		linkPtr = &link
	}

	if inApp {
		if _, err := dbclient.Client.Notifications.Create(ctx, userId, category, title, body, linkPtr); err != nil {
			log.Printf("Failed to create in-app notification for user %d: %v", userId, err)
		}
	}

	if discordDm {
		sendDiscordDM(ctx, userId, title, body)
	}

	if sendEmail {
		sendEmailNotification(ctx, userId, category, title, body, link)
	}
}

func SendToAdmins(ctx context.Context, category, title, body, link string) {
	staff, err := dbclient.Client.BotStaff.GetAll(ctx)
	if err != nil {
		// Not fatal: the owner is configured rather than stored, so still notify them.
		log.Printf("Failed to fetch bot staff for admin notification: %v", err)
	}

	recipients := make(map[uint64]struct{}, len(staff)+1)
	for _, s := range staff {
		recipients[s.UserId] = struct{}{}
	}
	if config.Conf.Owner != 0 {
		recipients[config.Conf.Owner] = struct{}{}
	}

	for userId := range recipients {
		Send(ctx, userId, category, title, body, link)
	}
}

// SendToOwner dispatches a notification to the bot owner only.
func SendToOwner(ctx context.Context, category, title, body, link string) {
	ownerId := config.Conf.Owner
	if ownerId == 0 {
		return
	}

	Send(ctx, ownerId, category, title, body, link)
}

func sendDiscordDM(ctx context.Context, userId uint64, title, body string) {
	token := config.Conf.Bot.Token
	if token == "" {
		return
	}

	dmCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	accentColour := 0x3498db
	divider := true

	rl := getDiscordRateLimiter()

	dm, err := rest.CreateDM(dmCtx, token, rl, userId)
	if err != nil {
		log.Printf("Failed to create DM channel for user %d: %v", userId, err)
		return
	}

	if _, err := rest.CreateMessage(dmCtx, token, rl, dm.Id, rest.CreateMessageData{
		Flags: 1 << 15,
		Components: []component.Component{
			component.BuildContainer(component.Container{
				AccentColor: &accentColour,
				Components: []component.Component{
					component.BuildTextDisplay(component.TextDisplay{
						Content: fmt.Sprintf("## %s", title),
					}),
					component.BuildSeparator(component.Separator{Divider: &divider}),
					component.BuildTextDisplay(component.TextDisplay{
						Content: body,
					}),
				},
			}),
		},
	}); err != nil {
		log.Printf("Failed to send DM to user %d: %v", userId, err)
	}
}

func sendEmailNotification(ctx context.Context, userId uint64, category, title, body, link string) {
	if email.DefaultClient == nil {
		return
	}

	userEmail, err := dbclient.Client.UserEmails.GetByUserId(ctx, userId)
	if err != nil {
		log.Printf("Failed to look up email for user %d: %v", userId, err)
		return
	}

	if userEmail == nil || !userEmail.Verified {
		return
	}

	unsubURL := email.UnsubscribeURL(config.Conf.Server.BaseUrl, config.Conf.Security.VerificationHmacSecret, userId, category)
	ctaURL := dashboardURL(link)
	htmlBody := email.NotificationEmail(title, body, ctaURL, unsubURL)
	textBody := email.NotificationEmailText(title, body, ctaURL, unsubURL)
	if err := email.DefaultClient.SendNotification(ctx, userEmail.Email, title, htmlBody, textBody, unsubURL); err != nil {
		log.Printf("Failed to send notification email to user %d: %v", userId, err)
	}
}

// Notification links are stored relative ("/admin/affiliate"), but an email button
// needs an absolute one.
func dashboardURL(link string) string {
	base := strings.TrimRight(config.Conf.Server.BaseUrl, "/")

	switch {
	case link == "":
		return base
	case strings.HasPrefix(link, "http://"), strings.HasPrefix(link, "https://"):
		return link
	case strings.HasPrefix(link, "/"):
		return base + link
	default:
		return base + "/" + link
	}
}
