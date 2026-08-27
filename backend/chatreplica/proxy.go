package chatreplica

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/ticketsbot-cloud/dashboard/backend/config"
)

var client = &http.Client{
	Transport: &http.Transport{
		TLSHandshakeTimeout: time.Second * 3, // We're not using TLS anyway
	},
	Timeout: time.Second * 3,
}

func Render(payload Payload) ([]byte, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	res, err := client.Post(config.Conf.Bot.RenderServiceUrl, "application/json", bytes.NewBuffer(encoded))
	if err != nil {
		return nil, err
	}

	if res.StatusCode != 200 {
		sentry.CaptureEvent(&sentry.Event{
			Extra: map[string]interface{}{
				"request_body": string(encoded),
			},
			Level:   sentry.LevelError,
			Message: fmt.Sprintf("Render service returned status code %d", res.StatusCode),
		})

		return nil, fmt.Errorf("render service returned status code %d", res.StatusCode)
	}

	bytes, err := ioutil.ReadAll(res.Body)
	defer res.Body.Close()
	if err != nil {
		return nil, err
	}

	return bytes, nil
}
