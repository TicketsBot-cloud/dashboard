package utils

import "github.com/TicketsBot-cloud/common/featureflags"

// FeatureFlags is assigned once during startup. Reading it before assignment is
// safe: the client's methods tolerate a nil receiver, which is treated the same
// as "GrowthBook not configured" and evaluates every flag to enabled.
var FeatureFlags *featureflags.Client

// ExposureRecorder is retained so shutdown can flush whatever is queued.
var ExposureRecorder *featureflags.Recorder
