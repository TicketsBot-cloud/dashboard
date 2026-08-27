package featureflags

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/ticketsbot-cloud/dashboard/backend/database"
	"github.com/ticketsbot-cloud/dashboard/backend/growthbook"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

type experimentResponse struct {
	Id          string `json:"id"`
	Name        string `json:"name"`
	TrackingKey string `json:"tracking_key"`
	Status      string `json:"status"`
	// AssignedOn is the unit the experiment buckets on, in staff-facing words.
	AssignedOn string              `json:"assigned_on"`
	Variations []variationResponse `json:"variations"`
	// ExposedUnits counts distinct units recorded per variation from our own
	// exposure table, not from GrowthBook. It answers "is this experiment
	// actually collecting data", which is the first thing that goes wrong.
	ExposedUnits map[int]int `json:"exposed_units"`
	UpdatedAt    string      `json:"updated_at"`
}

type variationResponse struct {
	Key  string `json:"key"`
	Name string `json:"name"`
}

func ListExperimentsHandler(ctx *gin.Context) {
	experiments, err := Client.ListExperiments(ctx)
	if err != nil {
		if errors.Is(err, growthbook.ErrNotConfigured) {
			ctx.JSON(200, []experimentResponse{})
			return
		}

		logUpstreamError("list experiments", err)
		ctx.JSON(502, utils.ErrorStr("Could not reach GrowthBook. Please try again."))
		return
	}

	result := make([]experimentResponse, 0, len(experiments))
	for _, experiment := range experiments {
		if experiment.Archived {
			continue
		}

		variations := make([]variationResponse, 0, len(experiment.Variations))
		for _, variation := range experiment.Variations {
			variations = append(variations, variationResponse{
				Key:  variation.Key,
				Name: variation.Name,
			})
		}

		// A failure here must not hide the experiment list, so fall back to an
		// empty count rather than erroring the whole response.
		counts, err := database.Client.ExperimentExposures.CountByExperiment(ctx, experiment.TrackingKey)
		if err != nil {
			logUpstreamError("count exposures for "+experiment.TrackingKey, err)
			counts = map[int]int{}
		}

		result = append(result, experimentResponse{
			Id:           experiment.Id,
			Name:         experiment.Name,
			TrackingKey:  experiment.TrackingKey,
			Status:       experiment.Status,
			AssignedOn:   attributeLabel(experiment.HashAttribute),
			Variations:   variations,
			ExposedUnits: counts,
			UpdatedAt:    experiment.DateUpdated.UTC().Format("2006-01-02T15:04:05Z"),
		})
	}

	ctx.JSON(200, result)
}
