package affiliate

import (
	"context"
	"fmt"
	"sync"

	polargo "github.com/polarsource/polar-go"
	"github.com/polarsource/polar-go/models/components"

	"github.com/TicketsBot-cloud/dashboard/config"
)

var (
	polarAdminClient *polargo.Polar
	polarAdminOnce   sync.Once
)

// getPolarClient returns a lazily-initialised Polar SDK client.
func getPolarClient() *polargo.Polar {
	polarAdminOnce.Do(func() {
		server := polargo.ServerProduction
		if config.Conf.Polar.IsSandbox {
			server = polargo.ServerSandbox
		}

		polarAdminClient = polargo.New(
			polargo.WithServer(server),
			polargo.WithSecurity(config.Conf.Polar.ApiKey),
		)
	})
	return polarAdminClient
}

// createPolarDiscount creates a percentage discount in Polar for the given affiliate code.
// Returns the Polar discount ID.
func createPolarDiscount(ctx context.Context, code string, basisPoints int) (discountId string, retErr error) {
	defer func() {
		if r := recover(); r != nil {
			retErr = fmt.Errorf("polar SDK panicked: %v", r)
		}
	}()

	client := getPolarClient()
	if client == nil {
		return "", fmt.Errorf("polar client is not initialised (check POLAR_API_KEY)")
	}

	res, err := client.Discounts.Create(ctx,
		components.CreateDiscountCreateDiscountPercentageRepeatDurationCreate(
			components.DiscountPercentageRepeatDurationCreate{
				Duration:         components.DiscountDurationRepeating,
				DurationInMonths: 3,
				Type:             components.DiscountTypePercentage,
				BasisPoints:      int64(basisPoints),
				Name:             fmt.Sprintf("Affiliate: %s", code),
				Code:             polargo.String(code),
			},
		),
	)
	if err != nil {
		return "", fmt.Errorf("polar API error: %w", err)
	}

	if res == nil {
		return "", fmt.Errorf("nil response from Polar API")
	}

	if res.Discount == nil {
		return "", fmt.Errorf("no discount in Polar response (HTTP status may have been non-2xx)")
	}

	id, err := extractDiscountId(res.Discount)
	if err != nil {
		return "", err
	}

	return id, nil
}

// deletePolarDiscount removes a discount from Polar by its ID.
func deletePolarDiscount(ctx context.Context, discountId string) error {
	_, err := getPolarClient().Discounts.Delete(ctx, discountId)
	return err
}

// extractDiscountId extracts the ID from a Discount union type.
func extractDiscountId(discount *components.Discount) (string, error) {
	if discount == nil {
		return "", fmt.Errorf("discount is nil")
	}

	if discount.DiscountPercentageOnceForeverDuration != nil {
		return discount.DiscountPercentageOnceForeverDuration.ID, nil
	}
	if discount.DiscountPercentageRepeatDuration != nil {
		return discount.DiscountPercentageRepeatDuration.ID, nil
	}
	if discount.DiscountFixedOnceForeverDuration != nil {
		return discount.DiscountFixedOnceForeverDuration.ID, nil
	}
	if discount.DiscountFixedRepeatDuration != nil {
		return discount.DiscountFixedRepeatDuration.ID, nil
	}

	return "", fmt.Errorf("could not extract discount ID from response")
}
