package email

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

func GenerateUnsubscribeToken(secret string, userId uint64, category string) string {
	payload := fmt.Sprintf("unsubscribe:%d:%s", userId, category)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	sig := mac.Sum(nil)
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func VerifyUnsubscribeToken(secret, token string) (uint64, string, error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return 0, "", fmt.Errorf("invalid token format")
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return 0, "", fmt.Errorf("invalid token payload")
	}

	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return 0, "", fmt.Errorf("invalid token signature")
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return 0, "", fmt.Errorf("invalid token signature")
	}

	payloadParts := strings.SplitN(string(payload), ":", 3)
	if len(payloadParts) != 3 || payloadParts[0] != "unsubscribe" {
		return 0, "", fmt.Errorf("invalid token payload")
	}

	userId, err := strconv.ParseUint(payloadParts[1], 10, 64)
	if err != nil {
		return 0, "", fmt.Errorf("invalid user ID")
	}

	return userId, payloadParts[2], nil
}

func UnsubscribeURL(baseUrl, secret string, userId uint64, category string) string {
	token := GenerateUnsubscribeToken(secret, userId, category)
	return fmt.Sprintf("%s/unsubscribe?token=%s", baseUrl, url.QueryEscape(token))
}
