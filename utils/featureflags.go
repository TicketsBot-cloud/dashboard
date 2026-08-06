package utils

import "github.com/TicketsBot-cloud/common/featureflags"

// FeatureFlags is assigned once during startup. Reading it before assignment is
// safe: the client's methods tolerate a nil receiver and evaluate every flag to
// off.
var FeatureFlags *featureflags.Client

// ExposureRecorder is retained so shutdown can flush whatever is queued.
var ExposureRecorder *featureflags.Recorder
