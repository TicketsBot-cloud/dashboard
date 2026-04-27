package defaults

import (
	"testing"

	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/stretchr/testify/assert"
)

func TestNil(t *testing.T) {
	var myString *string
	ApplyDefaults(NewDefaultApplicator(NilCheck[string], &myString, utils.Ptr("hello")))
	assert.Equal(t, "hello", *myString)
}
