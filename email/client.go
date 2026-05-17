package email

import (
	"context"
	"fmt"
	"time"

	"github.com/mailgun/mailgun-go/v4"
)

type Client struct {
	mg   *mailgun.MailgunImpl
	from string
}

func NewClient(domain, apiKey, fromEmail, fromName string, useEU bool) *Client {
	mg := mailgun.NewMailgun(domain, apiKey)
	if useEU {
		mg.SetAPIBase(mailgun.APIBaseEU)
	}
	return &Client{
		mg:   mg,
		from: fmt.Sprintf("%s <%s>", fromName, fromEmail),
	}
}

func (c *Client) Send(ctx context.Context, to, subject, htmlBody string) error {
	return c.SendNotification(ctx, to, subject, htmlBody, "")
}

func (c *Client) SendNotification(ctx context.Context, to, subject, htmlBody, unsubscribeUrl string) error {
	if c == nil || c.mg == nil {
		return nil
	}

	msg := mailgun.NewMessage(c.from, subject, "", to)
	msg.SetHTML(htmlBody)

	if unsubscribeUrl != "" {
		msg.AddHeader("List-Unsubscribe", fmt.Sprintf("<%s>", unsubscribeUrl))
		msg.AddHeader("List-Unsubscribe-Post", "List-Unsubscribe=One-Click")
	}

	sendCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	_, _, err := c.mg.Send(sendCtx, msg)
	return err
}
