package email

import (
	"fmt"
	"html"
)

// wrap provides the shared outer HTML structure for all email templates.
// It uses table-based layout for maximum email client compatibility
// (Gmail, Outlook, Apple Mail, Yahoo, etc.).
func wrap(content string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Tickets Bot</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style type="text/css">
body, table, td, a { -webkit-text-size-adjust: 100%%; -ms-text-size-adjust: 100%%; }
table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%%; outline: none; text-decoration: none; }
table { border-collapse: collapse !important; }
body { height: 100%% !important; margin: 0 !important; padding: 0 !important; width: 100%% !important; }
a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
</style>
</head>
<body style="margin: 0; padding: 0; background-color: #111827; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
<!-- Outer wrapper table -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" style="background-color: #111827;">
<tr>
<td align="center" style="padding: 40px 16px;">
<!-- Inner content table -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width: 560px; width: 100%%;">
<!-- Logo -->
<tr>
<td align="center" style="padding-bottom: 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
Tickets Bot
</td>
</tr>
</table>
</td>
</tr>
<!-- Card -->
<tr>
<td style="background-color: #1f2937; border-radius: 12px; border: 1px solid #374151;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">
<tr>
<td style="padding: 36px 32px;">
%s
</td>
</tr>
</table>
</td>
</tr>
<!-- Footer -->
<tr>
<td style="padding: 28px 16px 0 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">
<tr>
<td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1.6; color: #6b7280;">
You are receiving this email because you added an email address to your Tickets Bot account.
</td>
</tr>
<tr>
<td align="center" style="padding-top: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1.6; color: #6b7280;">
<a href="https://tickets.bot" style="color: #9ca3af; text-decoration: underline;">tickets.bot</a>
&nbsp;&middot;&nbsp;
<a href="https://discord.gg/ticketsbot" style="color: #9ca3af; text-decoration: underline;">Support</a>
</td>
</tr>
<tr>
<td align="center" style="padding-top: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #4b5563;">
BH Cloud Labs Ltd, trading as Tickets Bot<br>
Registered in England and Wales (No. 16211348)<br>
The Grange, Grange Road, Great Malvern, WR14 3HA
</td>
</tr>
</table>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`, content)
}

// EmailVerification generates the email body for verifying a user's email address.
func EmailVerification(code string, verifyUrl string) string {
	escapedCode := html.EscapeString(code)
	escapedUrl := html.EscapeString(verifyUrl)

	return wrap(fmt.Sprintf(`<!-- Heading -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 600; color: #ffffff; padding-bottom: 8px;">
Verify Your Email Address
</td>
</tr>
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #d1d5db; padding-bottom: 24px;">
Enter the following code in your dashboard settings to verify your email address:
</td>
</tr>
<!-- Verification code -->
<tr>
<td align="center" style="padding-bottom: 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="background-color: #111827; border: 1px solid #374151; border-radius: 8px; padding: 14px 28px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #ffffff; text-align: center;">
%s
</td>
</tr>
</table>
</td>
</tr>
<!-- Divider -->
<tr>
<td style="padding-bottom: 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">
<tr>
<td style="border-top: 1px solid #374151; font-size: 1px; line-height: 1px;">&nbsp;</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #d1d5db; padding-bottom: 24px;">
Or click the button below to verify automatically:
</td>
</tr>
<!-- CTA Button -->
<tr>
<td align="center" style="padding-bottom: 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" style="background-color: #3498db; border-radius: 8px;">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="%s" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="18%%" strokecolor="#3498db" fillcolor="#3498db">
<w:anchorlock/>
<center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:600;">Verify Email</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="%s" target="_blank" style="display: inline-block; background-color: #3498db; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 32px; border-radius: 8px; text-align: center;">
Verify Email
</a>
<!--<![endif]-->
</td>
</tr>
</table>
</td>
</tr>
<!-- Expiry notice -->
<tr>
<td style="padding-bottom: 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 13px; line-height: 1.5; color: #9ca3af;">
This code expires in 15 minutes.
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 13px; line-height: 1.5; color: #9ca3af;">
If you did not request this, you can safely ignore this email.
</td>
</tr>
</table>
</td>
</tr>
</table>`, escapedCode, escapedUrl, escapedUrl))
}

// AffiliateApproved generates the email body sent when an affiliate code is approved.
func AffiliateApproved(code string) string {
	escapedCode := html.EscapeString(code)

	return wrap(fmt.Sprintf(`<!-- Heading -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 600; color: #ffffff; padding-bottom: 8px;">
Your Affiliate Code is Active
</td>
</tr>
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #d1d5db; padding-bottom: 24px;">
Great news! Your affiliate application has been approved. Your code is now live and ready to share.
</td>
</tr>
<!-- Affiliate code -->
<tr>
<td align="center" style="padding-bottom: 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="background-color: #064e3b; border: 1px solid #065f46; border-radius: 8px; padding: 14px 28px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 24px; font-weight: 700; letter-spacing: 3px; color: #34d399; text-align: center;">
%s
</td>
</tr>
</table>
</td>
</tr>
<!-- Divider -->
<tr>
<td style="padding-bottom: 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">
<tr>
<td style="border-top: 1px solid #374151; font-size: 1px; line-height: 1px;">&nbsp;</td>
</tr>
</table>
</td>
</tr>
<!-- Info text -->
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #d1d5db; padding-bottom: 8px;">
Share your code with others. When someone subscribes using your code, they receive a discount and you earn credits towards premium time.
</td>
</tr>
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #d1d5db; padding-bottom: 28px;">
Visit your affiliate dashboard to track referrals, view earnings, and redeem your credits.
</td>
</tr>
<!-- CTA Button -->
<tr>
<td align="center" style="padding-bottom: 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" style="background-color: #2ecc71; border-radius: 8px;">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://dashboard.tickets.bot/affiliate" style="height:44px;v-text-anchor:middle;width:260px;" arcsize="18%%" strokecolor="#2ecc71" fillcolor="#2ecc71">
<w:anchorlock/>
<center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:600;">Go to Affiliate Dashboard</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="https://dashboard.tickets.bot/affiliate" target="_blank" style="display: inline-block; background-color: #2ecc71; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 32px; border-radius: 8px; text-align: center;">
Go to Affiliate Dashboard
</a>
<!--<![endif]-->
</td>
</tr>
</table>
</td>
</tr>
</table>`, escapedCode))
}

// NotificationEmail generates a generic notification email body.
func NotificationEmail(title, body string) string {
	escapedTitle := html.EscapeString(title)
	escapedBody := html.EscapeString(body)

	return wrap(fmt.Sprintf(`<!-- Heading -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 600; color: #ffffff; padding-bottom: 8px;">
%s
</td>
</tr>
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #d1d5db; padding-bottom: 24px;">
%s
</td>
</tr>
<!-- CTA Button -->
<tr>
<td align="center" style="padding-bottom: 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" style="background-color: #3498db; border-radius: 8px;">
<!--[if !mso]><!-->
<a href="https://dashboard.tickets.bot" target="_blank" style="display: inline-block; background-color: #3498db; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 32px; border-radius: 8px; text-align: center;">
Go to Dashboard
</a>
<!--<![endif]-->
</td>
</tr>
</table>
</td>
</tr>
</table>`, escapedTitle, escapedBody))
}

// AffiliateRevoked generates the email body sent when an affiliate code is revoked.
func AffiliateRevoked(code string) string {
	escapedCode := html.EscapeString(code)

	return wrap(fmt.Sprintf(`<!-- Heading -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 22px; font-weight: 600; color: #ffffff; padding-bottom: 8px;">
Your Affiliate Code Has Been Revoked
</td>
</tr>
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #d1d5db; padding-bottom: 24px;">
Your affiliate code has been deactivated by an administrator.
</td>
</tr>
<!-- Affiliate code -->
<tr>
<td align="center" style="padding-bottom: 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="background-color: #451a1a; border: 1px solid #7f1d1d; border-radius: 8px; padding: 14px 28px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 24px; font-weight: 700; letter-spacing: 3px; color: #fca5a5; text-align: center; text-decoration: line-through;">
%s
</td>
</tr>
</table>
</td>
</tr>
<!-- Divider -->
<tr>
<td style="padding-bottom: 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">
<tr>
<td style="border-top: 1px solid #374151; font-size: 1px; line-height: 1px;">&nbsp;</td>
</tr>
</table>
</td>
</tr>
<!-- Info text -->
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #d1d5db; padding-bottom: 8px;">
Any credits you have already earned remain available for redemption.
</td>
</tr>
<tr>
<td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #d1d5db; padding-bottom: 28px;">
If you believe this was done in error, please reach out to our support team.
</td>
</tr>
<!-- Support Button -->
<tr>
<td align="center" style="padding-bottom: 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" style="border: 2px solid #6b7280; border-radius: 8px;">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://discord.gg/ticketsbot" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="18%%" strokecolor="#6b7280" fillcolor="#1f2937">
<w:anchorlock/>
<center style="color:#d1d5db;font-family:sans-serif;font-size:15px;font-weight:600;">Contact Support</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="https://discord.gg/ticketsbot" target="_blank" style="display: inline-block; background-color: #1f2937; color: #d1d5db; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; font-weight: 600; text-decoration: none; padding: 10px 32px; border-radius: 6px; text-align: center;">
Contact Support
</a>
<!--<![endif]-->
</td>
</tr>
</table>
</td>
</tr>
</table>`, escapedCode))
}
