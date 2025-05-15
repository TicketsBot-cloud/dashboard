package chatreplica

import (
	"fmt"

	v2 "github.com/TicketsBot-cloud/logarchiver/pkg/model/v2"
)

func FromTranscript(transcript v2.Transcript, ticketId int) Payload {
	payload := Payload{
		Entities:    EntitiesFromTranscript(transcript.Entities),
		Messages:    MessagesFromTranscript(transcript.Messages),
		ChannelName: fmt.Sprintf("ticket-%d", ticketId),
	}

	return payload
}
