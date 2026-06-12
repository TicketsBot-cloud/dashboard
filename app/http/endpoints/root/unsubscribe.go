package root

import (
	"log"
	"net/http"

	"github.com/TicketsBot-cloud/dashboard/config"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
	"github.com/TicketsBot-cloud/dashboard/email"
	"github.com/TicketsBot-cloud/dashboard/notify"
	"github.com/gin-gonic/gin"
)

func UnsubscribeHandler(ctx *gin.Context) {
	wantsJSON := ctx.GetHeader("Accept") == "application/json"

	token := ctx.Query("token")
	if token == "" {
		if wantsJSON {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "Missing token"})
		} else {
			ctx.Data(http.StatusBadRequest, "text/html; charset=utf-8", []byte(unsubscribeErrorPage()))
		}
		return
	}

	userId, category, err := email.VerifyUnsubscribeToken(config.Conf.Security.VerificationHmacSecret, token)
	if err != nil {
		if wantsJSON {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or expired unsubscribe link"})
		} else {
			ctx.Data(http.StatusBadRequest, "text/html; charset=utf-8", []byte(unsubscribeErrorPage()))
		}
		return
	}

	var label string
	for _, cat := range notify.AllCategories {
		if cat.Key == category {
			label = cat.Label
			break
		}
	}
	if label == "" {
		if wantsJSON {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "Unknown notification category"})
		} else {
			ctx.Data(http.StatusBadRequest, "text/html; charset=utf-8", []byte(unsubscribeErrorPage()))
		}
		return
	}

	pref, err := dbclient.Client.NotificationPreferences.GetByUserIdAndCategory(ctx, userId, category)
	if err != nil {
		log.Printf("Failed to look up notification preferences for user %d: %v", userId, err)
		if wantsJSON {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process unsubscribe request"})
		} else {
			ctx.Data(http.StatusInternalServerError, "text/html; charset=utf-8", []byte(unsubscribeErrorPage()))
		}
		return
	}

	discordDm := notify.DefaultPreferences.DiscordDm
	inApp := notify.DefaultPreferences.InApp
	if pref != nil {
		discordDm = pref.DiscordDm
		inApp = pref.InApp
	}

	if err := dbclient.Client.NotificationPreferences.Upsert(ctx, userId, category, discordDm, false, inApp); err != nil {
		log.Printf("Failed to update notification preferences for user %d: %v", userId, err)
		if wantsJSON {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process unsubscribe request"})
		} else {
			ctx.Data(http.StatusInternalServerError, "text/html; charset=utf-8", []byte(unsubscribeErrorPage()))
		}
		return
	}

	if wantsJSON {
		ctx.JSON(http.StatusOK, gin.H{"success": true, "category": label})
	} else {
		ctx.Data(http.StatusOK, "text/html; charset=utf-8", []byte(unsubscribeSuccessPage(label)))
	}
}

func unsubscribeSuccessPage(categoryLabel string) string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Unsubscribed - Tickets Bot</title>
<style>
body { margin: 0; padding: 0; background-color: #111827; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #ffffff; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
.container { text-align: center; max-width: 480px; padding: 40px 24px; }
h1 { font-size: 24px; font-weight: 600; margin-bottom: 16px; }
p { font-size: 15px; line-height: 1.6; color: #d1d5db; margin-bottom: 12px; }
a { color: #3498db; text-decoration: underline; }
.card { background-color: #1f2937; border: 1px solid #374151; border-radius: 12px; padding: 36px 32px; }
.check { font-size: 48px; margin-bottom: 16px; color: #34d399; }
</style>
</head>
<body>
<div class="container">
<div class="card">
<div class="check">&#10003;</div>
<h1>Unsubscribed</h1>
<p>You have been unsubscribed from <strong>` + categoryLabel + `</strong> email notifications.</p>
<p>You can manage all your notification preferences in your <a href="https://dashboard.tickets.bot/settings">dashboard settings</a>.</p>
</div>
</div>
</body>
</html>`
}

func unsubscribeErrorPage() string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Unsubscribe - Tickets Bot</title>
<style>
body { margin: 0; padding: 0; background-color: #111827; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #ffffff; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
.container { text-align: center; max-width: 480px; padding: 40px 24px; }
h1 { font-size: 24px; font-weight: 600; margin-bottom: 16px; }
p { font-size: 15px; line-height: 1.6; color: #d1d5db; margin-bottom: 12px; }
a { color: #3498db; text-decoration: underline; }
.card { background-color: #1f2937; border: 1px solid #374151; border-radius: 12px; padding: 36px 32px; }
</style>
</head>
<body>
<div class="container">
<div class="card">
<h1>Invalid Link</h1>
<p>This unsubscribe link is invalid. Please manage your notification preferences in your <a href="https://dashboard.tickets.bot/settings">dashboard settings</a>.</p>
</div>
</div>
</body>
</html>`
}
