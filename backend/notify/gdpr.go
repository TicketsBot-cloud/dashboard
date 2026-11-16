package notify

import (
	"context"
	"fmt"

	"github.com/TicketsBot-cloud/common/gdprrelay"
)

var gdprRequestLabels = map[gdprrelay.RequestType]string{
	gdprrelay.RequestTypeAllTranscripts:      "transcript deletion",
	gdprrelay.RequestTypeSpecificTranscripts: "transcript deletion",
	gdprrelay.RequestTypeAllMessages:         "message anonymization",
	gdprrelay.RequestTypeSpecificMessages:    "message anonymization",
	gdprrelay.RequestTypeExportGuild:         "server data export",
	gdprrelay.RequestTypeExportUser:          "personal data export",
}

func gdprResultText(r gdprrelay.Notification) (title, body string) {
	label := gdprRequestLabels[r.RequestType]

	switch {
	case r.Status == gdprrelay.NotificationStatusFailed && r.Error != "":
		return "Your GDPR request failed", fmt.Sprintf("Your %s request couldn't be completed: %s", label, r.Error)
	case r.Status == gdprrelay.NotificationStatusFailed:
		return "Your GDPR request failed", fmt.Sprintf("Your %s request couldn't be completed. Please try again.", label)
	case r.Status == gdprrelay.NotificationStatusNoData:
		return "Nothing to export", fmt.Sprintf("We found no data for your %s, so there is nothing to download. It doesn't count towards your 24-hour export limit.", label)
	case r.RequestType == gdprrelay.RequestTypeExportGuild || r.RequestType == gdprrelay.RequestTypeExportUser:
		return fmt.Sprintf("Your %s is ready", label), "You can download it from the GDPR requests page for 30 days."
	case r.RequestType == gdprrelay.RequestTypeAllMessages || r.RequestType == gdprrelay.RequestTypeSpecificMessages:
		return "Your GDPR request is complete", countText(r.Count, "Anonymized %d message", "No messages of yours were found to anonymize.")
	default:
		return "Your GDPR request is complete", countText(r.Count, "Deleted %d transcript", "No transcripts were found to delete.")
	}
}

func countText(count int, format, none string) string {
	switch count {
	case 0:
		return none
	case 1:
		return fmt.Sprintf(format+".", count)
	default:
		return fmt.Sprintf(format+"s.", count)
	}
}

func gdprResultLink(r gdprrelay.Notification) (link, buttonLabel string) {
	if r.Status == gdprrelay.NotificationStatusCompleted && r.ExportId != 0 {
		return fmt.Sprintf("/gdpr?export_id=%d", r.ExportId), "Download"
	}

	return "/gdpr", "Open dashboard"
}

func SendGdprResult(ctx context.Context, r gdprrelay.Notification) {
	title, body := gdprResultText(r)
	link, buttonLabel := gdprResultLink(r)
	send(ctx, r.UserId, CategoryGdpr, title, body, link, buttonLabel)
}
