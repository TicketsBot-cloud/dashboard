package discord

import (
	"bytes"
	"encoding/json"
	"github.com/gin-gonic/contrib/sessions"
	"github.com/pasztorpisti/qs"
	"github.com/pkg/errors"
	"io/ioutil"
	"net/http"
	"time"
)

type RequestType string
type ContentType string

const(
	GET RequestType = "GET"
	POST RequestType = "POST"
	PATCH RequestType = "PATCH"

	ApplicationJson ContentType = "application/json"
	ApplicationFormUrlEncoded ContentType = "application/x-www-form-urlencoded"

	BASE_URL = "https://discordapp.com/api/v6"
)

type Endpoint struct {
	RequestType RequestType
	Endpoint string
}

func (e *Endpoint) Request(store sessions.Session, contentType *ContentType, body interface{}, response interface{}) error {
	url := BASE_URL + e.Endpoint

	// Create req
	var req *http.Request
	var err error
	if body == nil || contentType == nil {
		req, err = http.NewRequest(string(e.RequestType), url, nil)
	} else {
		// Encode body
		var encoded []byte
		if *contentType == ApplicationJson {
			raw, err := json.Marshal(body); if err != nil {
				return err
			}
			encoded = raw
		} else if *contentType == ApplicationFormUrlEncoded {
			str, err := qs.Marshal(body); if err != nil {
				return err
			}
			encoded = []byte(str)
		}

		// Create req
		req, err = http.NewRequest(string(e.RequestType), url, bytes.NewBuffer(encoded))
	}

	if err != nil {
		return err
	}

	// Set content type and user agent
	if contentType != nil {
		req.Header.Set("Content-Type", string(*contentType))
	}
	req.Header.Set("User-Agent", "DiscordBot (https://github.com/TicketsBot/GoPanel 1.0.0)")

	// Auth
	accessToken := store.Get("access_token").(string)
	expiry := store.Get("expiry").(int64)
	refreshToken := store.Get("refresh_token").(string)

	// Check if needs refresh
	if (time.Now().UnixNano() / int64(time.Second)) > int64(expiry) {
		res, err := RefreshToken(refreshToken); if err != nil {
			store.Clear()
			_ = store.Save()
			return errors.New("Please login again!")
		}

		store.Set("access_token", res.AccessToken)
		store.Set("expiry", (time.Now().UnixNano() / int64(time.Second)) + int64(res.ExpiresIn))
		store.Set("refresh_token", res.RefreshToken)

		accessToken = res.AccessToken
	}
	req.Header.Set("Authorization", "Bearer " + accessToken)

	client := &http.Client{}
	client.Timeout = 3 * time.Second

	res, err := client.Do(req); if err != nil {
		return err
	}
	defer res.Body.Close()

	content, err := ioutil.ReadAll(res.Body); if err != nil {
		return err
	}

	return json.Unmarshal(content, response)
}