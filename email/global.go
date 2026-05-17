package email

var DefaultClient *Client

func Init(domain, apiKey, fromEmail, fromName string, useEU bool) {
	if domain == "" || apiKey == "" {
		return
	}
	DefaultClient = NewClient(domain, apiKey, fromEmail, fromName, useEU)
}
