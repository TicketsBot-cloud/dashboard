package email

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/TicketsBot-cloud/dashboard/config"
	"github.com/TicketsBot-cloud/dashboard/redis"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/ratelimit"
)

var (
	emailNotifyRL     *ratelimit.Ratelimiter
	emailNotifyRLOnce sync.Once
)

func getEmailNotifyRateLimiter() *ratelimit.Ratelimiter {
	emailNotifyRLOnce.Do(func() {
		if redis.Client != nil {
			emailNotifyRL = ratelimit.NewRateLimiter(ratelimit.NewRedisStore(redis.Client.Client, "ratelimiter:email-notify"), 1)
		}
	})
	return emailNotifyRL
}

func NotifyAffiliateApproved(userId uint64, emailAddr string, emailVerified bool, code string) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if DefaultClient != nil && emailAddr != "" && emailVerified {
		unsubURL := UnsubscribeURL(config.Conf.Server.BaseUrl, config.Conf.Security.VerificationHmacSecret, userId, "affiliate")
		body := AffiliateApproved(code, unsubURL)
		if err := DefaultClient.SendNotification(ctx, emailAddr, "Your Affiliate Code is Active", body, unsubURL); err != nil {
			log.Printf("Failed to send affiliate approval email to user %d: %v", userId, err)
		}
	}

	accentColour := 0x2ecc71
	divider := true

	sendDM(ctx, userId, rest.CreateMessageData{
		Flags: 1 << 15,
		Components: []component.Component{
			component.BuildContainer(component.Container{
				AccentColor: &accentColour,
				Components: []component.Component{
					component.BuildTextDisplay(component.TextDisplay{
						Content: "## Your Affiliate Code is Active",
					}),
					component.BuildSeparator(component.Separator{Divider: &divider}),
					component.BuildTextDisplay(component.TextDisplay{
						Content: fmt.Sprintf("Your affiliate code **`%s`** has been approved and is now live.", code),
					}),
					component.BuildTextDisplay(component.TextDisplay{
						Content: "Share it with others - when someone subscribes using your code, they get a discount and you earn credits towards premium time.",
					}),
					component.BuildSeparator(component.Separator{Divider: &divider}),
					component.BuildTextDisplay(component.TextDisplay{
						Content: "-# Visit your Affiliate Dashboard to track referrals and redeem credits.",
					}),
				},
			}),
		},
	})
}

func NotifyAffiliateRevoked(userId uint64, emailAddr string, emailVerified bool, code string) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if DefaultClient != nil && emailAddr != "" && emailVerified {
		unsubURL := UnsubscribeURL(config.Conf.Server.BaseUrl, config.Conf.Security.VerificationHmacSecret, userId, "affiliate")
		body := AffiliateRevoked(code, unsubURL)
		if err := DefaultClient.SendNotification(ctx, emailAddr, "Your Affiliate Code Has Been Revoked", body, unsubURL); err != nil {
			log.Printf("Failed to send affiliate revocation email to user %d: %v", userId, err)
		}
	}

	accentColour := 0xe74c3c
	divider := true

	sendDM(ctx, userId, rest.CreateMessageData{
		Flags: 1 << 15,
		Components: []component.Component{
			component.BuildContainer(component.Container{
				AccentColor: &accentColour,
				Components: []component.Component{
					component.BuildTextDisplay(component.TextDisplay{
						Content: "## Your Affiliate Code Has Been Revoked",
					}),
					component.BuildSeparator(component.Separator{Divider: &divider}),
					component.BuildTextDisplay(component.TextDisplay{
						Content: fmt.Sprintf("Your affiliate code **`%s`** has been deactivated by an administrator.", code),
					}),
					component.BuildTextDisplay(component.TextDisplay{
						Content: "Any credits you have already earned remain available for redemption. If you believe this was done in error, please contact support.",
					}),
				},
			}),
		},
	})
}

func sendDM(ctx context.Context, userId uint64, data rest.CreateMessageData) {
	token := config.Conf.Bot.Token
	if token == "" {
		return
	}

	rl := getEmailNotifyRateLimiter()

	dm, err := rest.CreateDM(ctx, token, rl, userId)
	if err != nil {
		log.Printf("Failed to create DM channel for user %d: %v", userId, err)
		return
	}

	if _, err := rest.CreateMessage(ctx, token, rl, dm.Id, data); err != nil {
		log.Printf("Failed to send DM to user %d: %v", userId, err)
	}
}
