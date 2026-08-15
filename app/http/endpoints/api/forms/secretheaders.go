package forms

import (
	"context"

	dbclient "github.com/TicketsBot-cloud/dashboard/database"
)

const SecretHeaderMask = "••••••••"

func redactSecretHeaderValues(data *updateInputsBody) {
	redact := func(config *inputApiConfigBody) {
		if config == nil {
			return
		}

		for i := range config.Headers {
			if config.Headers[i].IsSecret {
				config.Headers[i].HeaderValue = SecretHeaderMask
			}
		}
	}

	for i := range data.Create {
		redact(data.Create[i].ApiConfig)
	}

	for i := range data.Update {
		redact(data.Update[i].ApiConfig)
	}
}

func existingSecretHeaders(ctx context.Context, apiConfigId int) (map[string]string, error) {
	headers, err := dbclient.Client.FormInputApiHeaders.GetByApiConfig(ctx, apiConfigId)
	if err != nil {
		return nil, err
	}

	values := make(map[string]string, len(headers))
	for _, header := range headers {
		if header.IsSecret {
			values[header.HeaderName] = header.HeaderValue
		}
	}

	return values, nil
}
