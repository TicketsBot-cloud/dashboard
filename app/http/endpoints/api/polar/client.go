package polar

import (
	"context"

	polargo "github.com/polarsource/polar-go"

	"github.com/TicketsBot-cloud/dashboard/config"
	dbclient "github.com/TicketsBot-cloud/dashboard/database"
)

var polarClient *polargo.Polar

// getPolarClient returns a lazily-initialised Polar SDK client.
func getPolarClient() *polargo.Polar {

	server := polargo.ServerProduction
	if config.Conf.Polar.IsSandbox {
		server = polargo.ServerSandbox
	}

	if polarClient == nil {
		polarClient = polargo.New(
			polargo.WithServer(server),
			polargo.WithSecurity(config.Conf.Polar.ApiKey),
		)
	}
	return polarClient
}

// isValidPolarProduct checks whether the given product ID exists in the
// polar_products database table.
func isValidPolarProduct(ctx context.Context, productId string) bool {
	product, err := dbclient.Client.PolarProducts.GetByPolarProductId(ctx, productId)
	return err == nil && product != nil
}
