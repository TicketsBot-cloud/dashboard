package api

import (
	"bytes"
	"encoding/json"
	"strings"

	"github.com/TicketsBot-cloud/database"
	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
)

func bindJSONWithKeys(c *gin.Context, obj any) (map[string]bool, error) {
	body, err := c.GetRawData()
	if err != nil {
		return nil, err
	}

	body, err = dropStringTrees(body)
	if err != nil {
		return nil, err
	}

	if err := binding.JSON.BindBody(body, obj); err != nil {
		return nil, err
	}

	return jsonKeys(body)
}

// Dashboards from before Components V2 echo the GET response, where trees are JSON strings.
func dropStringTrees(body []byte) ([]byte, error) {
	var fields map[string]json.RawMessage
	if err := json.NewDecoder(bytes.NewReader(body)).Decode(&fields); err != nil {
		return nil, err
	}

	dropped := false
	for key, value := range fields {
		switch strings.ToLower(key) {
		case "message_components", "welcome_message_components", "components":
			if len(value) > 0 && value[0] == '"' {
				delete(fields, key)
				dropped = true
			}
		}
	}

	if !dropped {
		return body, nil
	}

	return json.Marshal(fields)
}

func bindPanelCreateBody(c *gin.Context, data *panelBody) error {
	keys, err := bindJSONWithKeys(c, data)
	if err != nil {
		return err
	}

	if !keys["message_components"] {
		data.MessageUsesComponentsV2 = false
	}

	if !keys["welcome_message_components"] {
		data.WelcomeMessageUsesComponentsV2 = false
	}

	return nil
}

// Lower-cased because binding matches field names case-insensitively.
func jsonKeys(body []byte) (map[string]bool, error) {
	var fields map[string]json.RawMessage
	if err := json.NewDecoder(bytes.NewReader(body)).Decode(&fields); err != nil {
		return nil, err
	}

	keys := make(map[string]bool, len(fields))
	for key := range fields {
		keys[strings.ToLower(key)] = true
	}

	return keys, nil
}

func (p *panelBody) keepStoredWhenAbsent(keys map[string]bool, stored database.Panel) error {
	if !keys["message_uses_components_v2"] {
		p.MessageUsesComponentsV2 = stored.MessageUsesComponentsV2
	}

	if !keys["message_components"] && p.MessageUsesComponentsV2 {
		components, err := unmarshalComponents(stored.MessageComponents)
		if err != nil {
			return err
		}

		p.MessageComponents = components
	}

	if !keys["welcome_message_uses_components_v2"] {
		p.WelcomeMessageUsesComponentsV2 = stored.WelcomeMessageUsesComponentsV2
	}

	if !keys["welcome_message_components"] && p.WelcomeMessageUsesComponentsV2 {
		components, err := unmarshalComponents(stored.WelcomeMessageComponents)
		if err != nil {
			return err
		}

		p.WelcomeMessageComponents = components
	}

	if !keys["name"] {
		p.Name = stored.Name
	}

	return nil
}

func (p *panelBody) mergeStored(keys map[string]bool, existing database.Panel) error {
	if err := p.keepStoredWhenAbsent(keys, existing); err != nil {
		return err
	}

	p.retainClassicFields(existing, keys["colour"])
	return nil
}

func (d *multiPanelCreateData) keepStoredWhenAbsent(keys map[string]bool, stored database.MultiPanel) error {
	if !keys["uses_components_v2"] {
		d.UsesComponentsV2 = stored.UsesComponentsV2
	}

	if !keys["components"] && d.UsesComponentsV2 {
		components, err := unmarshalComponents(stored.Components)
		if err != nil {
			return err
		}

		d.Components = components
	}

	if !keys["name"] && stored.Name != nil {
		d.Name = *stored.Name
	}

	return nil
}
