package defaults

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/ticketsbot-cloud/dashboard/backend/utils"
)

func TestNil(t *testing.T) {
	var myString *string
	ApplyDefaults(NewDefaultApplicator[*string](NilCheck[string], &myString, utils.Ptr("hello")))
	assert.Equal(t, "hello", *myString)
}
