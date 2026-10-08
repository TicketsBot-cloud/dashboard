package api

import (
	"fmt"
	"testing"

	"github.com/TicketsBot-cloud/database"
	"github.com/TicketsBot-cloud/gdl/objects/interaction/component"
	"github.com/stretchr/testify/require"
)

func strPtr(s string) *string { return &s }

func linkButton(url string) component.Component {
	return component.BuildButton(component.Button{
		Label: "Visit",
		Style: component.ButtonStyleLink,
		Url:   strPtr(url),
	})
}

func linkButtons(n int) []component.Component {
	buttons := make([]component.Component, n)
	for i := range buttons {
		buttons[i] = linkButton(fmt.Sprintf("https://example.com/%d", i))
	}
	return buttons
}

// TestValidateSectionAccessory targets the one deliberate relaxation of the "no
// interactive components anywhere" invariant: a Section's accessory may be a Thumbnail,
// or a link-style Button with no custom_id. Every other shape must still be rejected.
func TestValidateSectionAccessory(t *testing.T) {
	tests := []struct {
		name      string
		accessory component.Component
		wantErr   bool
	}{
		{
			// Discord's Section object requires an accessory, and gdl's Component.MarshalJSON
			// errors out (rather than omitting the key) on a zero-value ComponentData, so a
			// missing accessory must be rejected here - otherwise it passes validation but
			// then fails to marshal when the message is actually sent.
			name:      "missing accessory is rejected, not silently accepted",
			accessory: component.Component{},
			wantErr:   true,
		},
		{
			name:      "valid thumbnail",
			accessory: component.BuildThumbnail(component.Thumbnail{Media: component.UnfurledMediaItem{Url: "https://example.com/image.png"}}),
			wantErr:   false,
		},
		{
			name: "valid link button",
			accessory: component.BuildButton(component.Button{
				Label: "Visit",
				Style: component.ButtonStyleLink,
				Url:   strPtr("https://example.com"),
			}),
			wantErr: false,
		},
		{
			name: "link style button with a smuggled custom_id",
			accessory: component.BuildButton(component.Button{
				Label:    "Visit",
				Style:    component.ButtonStyleLink,
				CustomId: "close", // attacker tries to ride a system custom_id through the link exception
				Url:      strPtr("https://example.com"),
			}),
			wantErr: true,
		},
		{
			name: "link style button with any non-system custom_id",
			accessory: component.BuildButton(component.Button{
				Label:    "Visit",
				Style:    component.ButtonStyleLink,
				CustomId: "attacker_defined_id",
				Url:      strPtr("https://example.com"),
			}),
			wantErr: true,
		},
		{
			name: "primary style button with no custom_id and a url",
			accessory: component.BuildButton(component.Button{
				Label: "Click",
				Style: component.ButtonStylePrimary,
				Url:   strPtr("https://example.com"),
			}),
			wantErr: true,
		},
		{
			name: "secondary style button with custom_id",
			accessory: component.BuildButton(component.Button{
				Label:    "Click",
				Style:    component.ButtonStyleSecondary,
				CustomId: "claim",
			}),
			wantErr: true,
		},
		{
			name: "success style button with custom_id",
			accessory: component.BuildButton(component.Button{
				Label:    "Click",
				Style:    component.ButtonStyleSuccess,
				CustomId: "claim",
			}),
			wantErr: true,
		},
		{
			name: "danger style button with custom_id",
			accessory: component.BuildButton(component.Button{
				Label:    "Click",
				Style:    component.ButtonStyleDanger,
				CustomId: "close",
			}),
			wantErr: true,
		},
		{
			name: "premium style button (sku, no custom_id, no url)",
			accessory: component.BuildButton(component.Button{
				Label: "Buy",
				Style: component.ButtonStylePremium,
			}),
			wantErr: true,
		},
		{
			name: "link style button with empty url",
			accessory: component.BuildButton(component.Button{
				Label: "Visit",
				Style: component.ButtonStyleLink,
				Url:   strPtr(""),
			}),
			wantErr: true,
		},
		{
			name: "link style button with nil url",
			accessory: component.BuildButton(component.Button{
				Label: "Visit",
				Style: component.ButtonStyleLink,
				Url:   nil,
			}),
			wantErr: true,
		},
		{
			name: "string select menu as accessory",
			accessory: component.BuildSelectMenu(component.SelectMenu{
				CustomId: "attacker_select",
				Options:  []component.SelectOption{{Label: "a", Value: "a"}},
			}),
			wantErr: true,
		},
		{
			name:      "user select menu as accessory",
			accessory: component.BuildUserSelect(component.UserSelect{CustomId: "attacker_select"}),
			wantErr:   true,
		},
		{
			name:      "role select menu as accessory",
			accessory: component.BuildRoleSelect(component.RoleSelect{CustomId: "attacker_select"}),
			wantErr:   true,
		},
		{
			name:      "mentionable select menu as accessory",
			accessory: component.BuildMentionableSelect(component.MentionableSelect{CustomId: "attacker_select"}),
			wantErr:   true,
		},
		{
			name:      "channel select menu as accessory",
			accessory: component.BuildChannelSelect(component.ChannelSelect{CustomId: "attacker_select"}),
			wantErr:   true,
		},
		{
			name: "action row as accessory",
			accessory: component.BuildActionRow(component.BuildButton(component.Button{
				Label: "x", Style: component.ButtonStylePrimary, CustomId: "close",
			})),
			wantErr: true,
		},
		{
			name: "type says button but data is actually a section (type confusion attempt)",
			accessory: component.Component{
				Type:          component.ComponentButton,
				ComponentData: component.Section{},
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateSectionAccessory(tt.accessory, nil)
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

// TestValidateActionRow covers the direct unit boundary cases for a guild-authored
// action row of link buttons: Discord's 5-per-row cap, an empty row, and a row
// containing anything other than a link button.
func TestValidateActionRow(t *testing.T) {
	tests := []struct {
		name    string
		row     component.ActionRow
		wantErr bool
	}{
		{
			name:    "1 link button",
			row:     component.ActionRow{Components: linkButtons(1)},
			wantErr: false,
		},
		{
			name:    "5 link buttons: at Discord's per-row limit",
			row:     component.ActionRow{Components: linkButtons(5)},
			wantErr: false,
		},
		{
			name:    "6 link buttons: one over Discord's per-row limit",
			row:     component.ActionRow{Components: linkButtons(6)},
			wantErr: true,
		},
		{
			name:    "empty row",
			row:     component.ActionRow{},
			wantErr: true,
		},
		{
			name: "one non-link-style button among otherwise-valid link buttons",
			row: component.ActionRow{
				Components: append(linkButtons(2), component.BuildButton(component.Button{
					Label: "x", Style: component.ButtonStylePrimary, CustomId: "close",
				})),
			},
			wantErr: true,
		},
		{
			name: "a select menu inside the row",
			row: component.ActionRow{
				Components: []component.Component{
					component.BuildSelectMenu(component.SelectMenu{CustomId: "x", Options: []component.SelectOption{{Label: "a", Value: "a"}}}),
				},
			},
			wantErr: true,
		},
		{
			name: "a link-style button with a smuggled custom_id among the row",
			row: component.ActionRow{
				Components: []component.Component{
					component.BuildButton(component.Button{Label: "Visit", Style: component.ButtonStyleLink, CustomId: "close", Url: strPtr("https://example.com")}),
				},
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateActionRow(tt.row, nil, false)
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

// TestValidateComponentTree_ActionRowOfLinkButtons confirms the ActionRow-of-link-buttons
// exception is scoped to the top-level/Container-child position only: it must not extend
// to a Section's accessory (still limited to a single thumbnail or link button, never a
// whole row) or to nesting one action row inside another.
func TestValidateComponentTree_ActionRowOfLinkButtons(t *testing.T) {
	tests := []struct {
		name    string
		tree    []component.Component
		wantErr bool
	}{
		{
			name:    "valid: a row of 3 link buttons at top level",
			tree:    []component.Component{component.BuildActionRow(linkButtons(3)...)},
			wantErr: false,
		},
		{
			name: "valid: a row of 5 link buttons inside a container",
			tree: []component.Component{
				component.BuildContainer(component.Container{
					Components: []component.Component{component.BuildActionRow(linkButtons(5)...)},
				}),
			},
			wantErr: false,
		},
		{
			name:    "rejected: a row of 6 link buttons",
			tree:    []component.Component{component.BuildActionRow(linkButtons(6)...)},
			wantErr: true,
		},
		{
			name: "rejected: a row mixing a non-link button with link buttons",
			tree: []component.Component{
				component.BuildActionRow(append(linkButtons(2), systemCustomIdButton("claim"))...),
			},
			wantErr: true,
		},
		{
			name: "rejected: an action row used as a section's accessory (a row, not a single component)",
			tree: []component.Component{
				component.BuildSection(component.Section{
					Components: []component.Component{component.BuildTextDisplay(component.TextDisplay{Content: "hi"})},
					Accessory:  component.BuildActionRow(linkButtons(1)...),
				}),
			},
			wantErr: true,
		},
		{
			name: "rejected: an action row nested inside another action row",
			tree: []component.Component{
				component.BuildActionRow(component.BuildActionRow(linkButtons(1)...)),
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateComponentTree(tt.tree, nil, false)
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func systemCustomIdButton(customId string) component.Component {
	return component.BuildButton(component.Button{
		Label:    "x",
		Style:    component.ButtonStylePrimary,
		CustomId: customId,
	})
}

// TestValidateComponentTree_RejectsInteractiveComponentsEverywhere confirms that the
// link-button relaxation is scoped to exactly the Section.Accessory position, and that
// every interactive component type is rejected at every other position/depth.
func TestValidateComponentTree_RejectsInteractiveComponentsEverywhere(t *testing.T) {
	tests := []struct {
		name    string
		tree    []component.Component
		wantErr bool
	}{
		{
			name:    "top level action row with a button",
			tree:    []component.Component{component.BuildActionRow(systemCustomIdButton("close"))},
			wantErr: true,
		},
		{
			name:    "top level button (not inside an action row)",
			tree:    []component.Component{systemCustomIdButton("claim")},
			wantErr: true,
		},
		{
			name: "button directly inside a container's components (not a section accessory)",
			tree: []component.Component{
				component.BuildContainer(component.Container{
					Components: []component.Component{systemCustomIdButton("close")},
				}),
			},
			wantErr: true,
		},
		{
			name: "a link button placed directly in a container's components, not as a section accessory",
			tree: []component.Component{
				component.BuildContainer(component.Container{
					Components: []component.Component{
						component.BuildButton(component.Button{Label: "x", Style: component.ButtonStyleLink, Url: strPtr("https://example.com")}),
					},
				}),
			},
			wantErr: true,
		},
		{
			name: "action row nested inside a container",
			tree: []component.Component{
				component.BuildContainer(component.Container{
					Components: []component.Component{
						component.BuildActionRow(systemCustomIdButton("close")),
					},
				}),
			},
			wantErr: true,
		},
		{
			name: "action row nested inside a section's components",
			tree: []component.Component{
				component.BuildSection(component.Section{
					Components: []component.Component{
						component.BuildActionRow(systemCustomIdButton("close")),
					},
					Accessory: component.BuildThumbnail(component.Thumbnail{Media: component.UnfurledMediaItem{Url: "https://example.com/i.png"}}),
				}),
			},
			wantErr: true,
		},
		{
			name: "select menu nested inside a section's components",
			tree: []component.Component{
				component.BuildSection(component.Section{
					Components: []component.Component{
						component.BuildSelectMenu(component.SelectMenu{CustomId: "x", Options: []component.SelectOption{{Label: "a", Value: "a"}}}),
					},
				}),
			},
			wantErr: true,
		},
		{
			name: "action row nested two levels deep (container > container > action row)",
			tree: []component.Component{
				component.BuildContainer(component.Container{
					Components: []component.Component{
						component.BuildContainer(component.Container{
							Components: []component.Component{
								component.BuildActionRow(systemCustomIdButton("close")),
							},
						}),
					},
				}),
			},
			wantErr: true,
		},
		{
			name: "thumbnail as a top-level entry (not a section accessory)",
			tree: []component.Component{
				component.BuildThumbnail(component.Thumbnail{Media: component.UnfurledMediaItem{Url: "https://example.com/i.png"}}),
			},
			wantErr: true,
		},
		{
			name: "thumbnail nested inside a container's components (not a section accessory)",
			tree: []component.Component{
				component.BuildContainer(component.Container{
					Components: []component.Component{
						component.BuildThumbnail(component.Thumbnail{Media: component.UnfurledMediaItem{Url: "https://example.com/i.png"}}),
					},
				}),
			},
			wantErr: true,
		},
		{
			name: "input text nested inside a container",
			tree: []component.Component{
				component.BuildContainer(component.Container{
					Components: []component.Component{
						component.BuildInputText(component.InputText{CustomId: "x"}),
					},
				}),
			},
			wantErr: true,
		},
		{
			name:    "unsupported/unknown component type",
			tree:    []component.Component{{Type: component.ComponentType(255)}},
			wantErr: true,
		},
		{
			name: "valid tree: container containing a section with a thumbnail accessory",
			tree: []component.Component{
				component.BuildContainer(component.Container{
					Components: []component.Component{
						component.BuildSection(component.Section{
							Components: []component.Component{
								component.BuildTextDisplay(component.TextDisplay{Content: "hello"}),
							},
							Accessory: component.BuildThumbnail(component.Thumbnail{Media: component.UnfurledMediaItem{Url: "https://example.com/i.png"}}),
						}),
					},
				}),
			},
			wantErr: false,
		},
		{
			name: "valid tree: section with a link-button accessory",
			tree: []component.Component{
				component.BuildSection(component.Section{
					Components: []component.Component{
						component.BuildTextDisplay(component.TextDisplay{Content: "hello"}),
					},
					Accessory: component.BuildButton(component.Button{Label: "Visit", Style: component.ButtonStyleLink, Url: strPtr("https://example.com")}),
				}),
			},
			wantErr: false,
		},
		{
			name: "valid tree: bare leaf types at top level",
			tree: []component.Component{
				component.BuildTextDisplay(component.TextDisplay{Content: "hi"}),
				component.BuildSeparator(component.Separator{}),
				component.BuildMediaGallery(component.MediaGallery{}),
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateComponentTree(tt.tree, nil, false)
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

// TestValidateComponentTree_ValidTreesAreMarshalable is a regression guard for the
// invariant that anything validateComponentTree accepts must actually be serialisable -
// gdl's Component.MarshalJSON errors (rather than omitting the key) on a Section with a
// zero-value accessory, so a validator that is more lenient than the marshaller produces
// a tree that passes validation but then 500s when the message is actually sent.
func TestValidateComponentTree_ValidTreesAreMarshalable(t *testing.T) {
	tests := []struct {
		name string
		tree []component.Component
	}{
		{
			name: "section with thumbnail accessory",
			tree: []component.Component{
				component.BuildSection(component.Section{
					Components: []component.Component{component.BuildTextDisplay(component.TextDisplay{Content: "hi"})},
					Accessory:  component.BuildThumbnail(component.Thumbnail{Media: component.UnfurledMediaItem{Url: "https://example.com/i.png"}}),
				}),
			},
		},
		{
			name: "section with link button accessory",
			tree: []component.Component{
				component.BuildSection(component.Section{
					Components: []component.Component{component.BuildTextDisplay(component.TextDisplay{Content: "hi"})},
					Accessory:  component.BuildButton(component.Button{Label: "Visit", Style: component.ButtonStyleLink, Url: strPtr("https://example.com")}),
				}),
			},
		},
		{
			name: "container wrapping a section with a thumbnail accessory",
			tree: []component.Component{
				component.BuildContainer(component.Container{
					Components: []component.Component{
						component.BuildSection(component.Section{
							Components: []component.Component{component.BuildTextDisplay(component.TextDisplay{Content: "hi"})},
							Accessory:  component.BuildThumbnail(component.Thumbnail{Media: component.UnfurledMediaItem{Url: "https://example.com/i.png"}}),
						}),
					},
				}),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.NoError(t, validateComponentTree(tt.tree, nil, false), "tree should pass validation")

			_, err := marshalComponents(tt.tree)
			require.NoError(t, err, "a tree that passes validation must also be marshalable for storage/sending")
		})
	}
}

// TestValidateComponentTree_DepthLimit ensures a pathologically deep (but otherwise cheap)
// attacker-supplied tree is rejected quickly rather than triggering unbounded recursion.
func TestValidateComponentTree_DepthLimit(t *testing.T) {
	// Build a long chain of nested containers, each with exactly one child.
	const depth = 100

	var leaf component.Component = component.BuildTextDisplay(component.TextDisplay{Content: "leaf"})
	tree := []component.Component{leaf}
	for i := 0; i < depth; i++ {
		tree = []component.Component{component.BuildContainer(component.Container{Components: tree})}
	}

	err := validateComponentTree(tree, nil, false)
	require.Error(t, err, "a tree nested %d levels deep should be rejected rather than fully walked", depth)
}

// TestValidateComponentTreeBudget covers the exact boundary of Discord's 10-top-level /
// 30-total component limits once the reserved system-component budget is subtracted, for
// each surface's reservation formula.
func TestValidateComponentTreeBudget(t *testing.T) {
	textDisplay := func() component.Component {
		return component.BuildTextDisplay(component.TextDisplay{Content: "x"})
	}

	makeTree := func(n int) []component.Component {
		tree := make([]component.Component, n)
		for i := range tree {
			tree[i] = textDisplay()
		}
		return tree
	}

	tests := []struct {
		name             string
		tree             []component.Component
		reservedTopLevel int
		reservedTotal    int
		wantErr          bool
	}{
		{
			name:             "panel button-message: exactly at budget (9 top-level, reserve 1/2)",
			tree:             makeTree(9),
			reservedTopLevel: 1,
			reservedTotal:    2,
			wantErr:          false, // 9+1=10 top level, 9+2=11 total, both within limits
		},
		{
			name:             "panel button-message: one over top-level budget",
			tree:             makeTree(10),
			reservedTopLevel: 1,
			reservedTotal:    2,
			wantErr:          true, // 10+1=11 > 10
		},
		{
			name: "panel button-message: within top-level but over total budget via nesting",
			// 1 top-level container containing 28 text displays: 1 top-level (ok, 1+1=2<=10),
			// but total = 1 (container) + 28 (children) = 29; 29+2=31 > 30.
			tree: []component.Component{
				component.BuildContainer(component.Container{Components: makeTree(28)}),
			},
			reservedTopLevel: 1,
			reservedTotal:    2,
			wantErr:          true,
		},
		{
			name: "panel button-message: exactly at total budget via nesting",
			// 1 top-level container containing 27 text displays: total = 1+27=28; 28+2=30<=30.
			tree: []component.Component{
				component.BuildContainer(component.Container{Components: makeTree(27)}),
			},
			reservedTopLevel: 1,
			reservedTotal:    2,
			wantErr:          false,
		},
		{
			name:             "multi-panel button mode at N=15 targets: tightest reservation (reserve 3/18)",
			tree:             makeTree(7),
			reservedTopLevel: 3,
			reservedTotal:    18,
			wantErr:          false, // 7+3=10, 7+18=25
		},
		{
			name:             "multi-panel button mode at N=15 targets: one top-level component too many",
			tree:             makeTree(8),
			reservedTopLevel: 3,
			reservedTotal:    18,
			wantErr:          true, // 8+3=11 > 10
		},
		{
			name:             "multi-panel select-menu mode: reserve 1/2",
			tree:             makeTree(9),
			reservedTopLevel: 1,
			reservedTotal:    2,
			wantErr:          false,
		},
		{
			name:             "welcome message with all 3 buttons visible: reserve 2/7",
			tree:             makeTree(8),
			reservedTopLevel: 2,
			reservedTotal:    7,
			wantErr:          false, // 8+2=10, 8+7=15
		},
		{
			name:             "welcome message with all 3 buttons visible: one over",
			tree:             makeTree(9),
			reservedTopLevel: 2,
			reservedTotal:    7,
			wantErr:          true, // 9+2=11 > 10
		},
		{
			name:             "welcome message with no buttons visible: reserve 1/3",
			tree:             makeTree(9),
			reservedTopLevel: 1,
			reservedTotal:    3,
			wantErr:          false,
		},
		{
			name:             "empty tree always within budget",
			tree:             nil,
			reservedTopLevel: 3,
			reservedTotal:    18,
			wantErr:          false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateComponentTreeBudget(tt.tree, tt.reservedTopLevel, tt.reservedTotal)
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

// TestCountComponents verifies the component counter actually recurses into every place
// a component array can appear, so it can't be undercounted via nesting.
func TestCountComponents(t *testing.T) {
	tests := []struct {
		name string
		tree []component.Component
		want int
	}{
		{
			name: "flat list",
			tree: []component.Component{
				component.BuildTextDisplay(component.TextDisplay{Content: "a"}),
				component.BuildTextDisplay(component.TextDisplay{Content: "b"}),
			},
			want: 2,
		},
		{
			name: "container with children counts container + each child",
			tree: []component.Component{
				component.BuildContainer(component.Container{
					Components: []component.Component{
						component.BuildTextDisplay(component.TextDisplay{Content: "a"}),
						component.BuildTextDisplay(component.TextDisplay{Content: "b"}),
					},
				}),
			},
			want: 3, // container + 2 children
		},
		{
			name: "section with children and accessory counts section + children + accessory",
			tree: []component.Component{
				component.BuildSection(component.Section{
					Components: []component.Component{
						component.BuildTextDisplay(component.TextDisplay{Content: "a"}),
					},
					Accessory: component.BuildThumbnail(component.Thumbnail{Media: component.UnfurledMediaItem{Url: "https://example.com/i.png"}}),
				}),
			},
			want: 3, // section + 1 child + 1 accessory
		},
		{
			name: "section with no accessory does not overcount",
			tree: []component.Component{
				component.BuildSection(component.Section{
					Components: []component.Component{
						component.BuildTextDisplay(component.TextDisplay{Content: "a"}),
					},
				}),
			},
			want: 2, // section + 1 child, no accessory
		},
		{
			name: "nested container inside container counts every level",
			tree: []component.Component{
				component.BuildContainer(component.Container{
					Components: []component.Component{
						component.BuildContainer(component.Container{
							Components: []component.Component{
								component.BuildTextDisplay(component.TextDisplay{Content: "a"}),
							},
						}),
					},
				}),
			},
			want: 3, // outer container + inner container + text display
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := countComponents(tt.tree)
			require.Equal(t, tt.want, got)
		})
	}
}

// TestValidateMessageComponents_PremiumGate confirms a Free-tier guild cannot enable the
// panel button-message Components V2 tree, and that a Premium guild with an invalid tree
// still gets rejected on content, not waved through once premium is confirmed.
func TestValidateMessageComponents_PremiumGate(t *testing.T) {
	validTree := []component.Component{component.BuildTextDisplay(component.TextDisplay{Content: "hi"})}
	maliciousTree := []component.Component{component.BuildActionRow(systemCustomIdButton("close"))}

	tests := []struct {
		name      string
		isPremium bool
		enabled   bool
		tree      []component.Component
		wantErr   bool
	}{
		{
			name:      "flag off on free tier: tree ignored, always valid",
			isPremium: false,
			enabled:   false,
			tree:      maliciousTree,
			wantErr:   false,
		},
		{
			name:      "flag on but not premium: rejected regardless of tree content",
			isPremium: false,
			enabled:   true,
			tree:      validTree,
			wantErr:   true,
		},
		{
			name:      "flag on and premium, valid tree: accepted",
			isPremium: true,
			enabled:   true,
			tree:      validTree,
			wantErr:   false,
		},
		{
			name:      "flag on and premium, malicious tree: still rejected",
			isPremium: true,
			enabled:   true,
			tree:      maliciousTree,
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := PanelValidationContext{
				Data: panelBody{
					MessageUsesComponentsV2: tt.enabled,
					MessageComponents:       tt.tree,
				},
				IsPremium: tt.isPremium,
			}

			err := validateMessageComponents(ctx)()
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

// TestValidateWelcomeMessageComponents_PremiumGate mirrors the button-message premium
// gate test for the welcome-message surface, and exercises the visible-button-count
// dependent reservation.
func TestValidateWelcomeMessageComponents_PremiumGate(t *testing.T) {
	t.Run("free tier rejected", func(t *testing.T) {
		ctx := PanelValidationContext{
			Data: panelBody{
				WelcomeMessageUsesComponentsV2: true,
				WelcomeMessageComponents:       []component.Component{component.BuildTextDisplay(component.TextDisplay{Content: "hi"})},
			},
			IsPremium: false,
		}

		err := validateWelcomeMessageComponents(ctx)()
		require.Error(t, err)
	})

	t.Run("malicious tree rejected even when premium", func(t *testing.T) {
		ctx := PanelValidationContext{
			Data: panelBody{
				WelcomeMessageUsesComponentsV2: true,
				WelcomeMessageComponents: []component.Component{
					component.BuildSection(component.Section{
						Accessory: component.BuildSelectMenu(component.SelectMenu{CustomId: "x", Options: []component.SelectOption{{Label: "a", Value: "a"}}}),
					}),
				},
			},
			IsPremium: true,
		}

		err := validateWelcomeMessageComponents(ctx)()
		require.Error(t, err)
	})

	t.Run("premium, valid tree, budget accounts for all three visible buttons", func(t *testing.T) {
		tree := make([]component.Component, 8)
		for i := range tree {
			tree[i] = component.BuildTextDisplay(component.TextDisplay{Content: fmt.Sprintf("field %d", i)})
		}

		ctx := PanelValidationContext{
			Data: panelBody{
				WelcomeMessageUsesComponentsV2: true,
				WelcomeMessageComponents:       tree,
				HideCloseButton:                false,
				HideCloseWithReasonButton:      false,
				HideClaimButton:                false,
			},
			IsPremium: true,
		}

		// reservedTopLevel = 1 (form placeholder) + 1 (button row) = 2
		// reservedTotal = 3 (form placeholder) + 3 buttons + 1 row = 7
		// 8 top-level components: 8+2=10 (at budget); total 8+7=15 (within budget)
		err := validateWelcomeMessageComponents(ctx)()
		require.NoError(t, err)

		// One more top-level component should now exceed the top-level budget.
		ctxOverBudget := ctx
		ctxOverBudget.Data.WelcomeMessageComponents = append(tree, component.BuildTextDisplay(component.TextDisplay{Content: "one too many"}))
		err = validateWelcomeMessageComponents(ctxOverBudget)()
		require.Error(t, err)
	})

	t.Run("premium, all buttons hidden, budget only reserves the form placeholder", func(t *testing.T) {
		tree := make([]component.Component, 9)
		for i := range tree {
			tree[i] = component.BuildTextDisplay(component.TextDisplay{Content: fmt.Sprintf("field %d", i)})
		}

		ctx := PanelValidationContext{
			Data: panelBody{
				WelcomeMessageUsesComponentsV2: true,
				WelcomeMessageComponents:       tree,
				HideCloseButton:                true,
				HideCloseWithReasonButton:      true,
				HideClaimButton:                true,
			},
			IsPremium: true,
		}

		// reservedTopLevel = 1, reservedTotal = 3; 9+1=10 top level (at budget)
		err := validateWelcomeMessageComponents(ctx)()
		require.NoError(t, err)
	})
}

// TestValidateMultiPanelComponents exercises the two reservation formulas (select-menu
// mode vs button mode) including the tightest documented boundary case: N=15 targets in
// button mode reserves 3 rows and 18 total slots.
func TestValidateMultiPanelComponents(t *testing.T) {
	makeTree := func(n int) []component.Component {
		tree := make([]component.Component, n)
		for i := range tree {
			tree[i] = component.BuildTextDisplay(component.TextDisplay{Content: fmt.Sprintf("x%d", i)})
		}
		return tree
	}

	panelsOfLen := func(n int) []panelConfiguration {
		panels := make([]panelConfiguration, n)
		for i := range panels {
			panels[i] = panelConfiguration{PanelId: i}
		}
		return panels
	}

	tests := []struct {
		name    string
		data    multiPanelCreateData
		wantErr bool
	}{
		{
			name: "flag off: malicious tree ignored",
			data: multiPanelCreateData{
				UsesComponentsV2: false,
				Components:       []component.Component{component.BuildActionRow(systemCustomIdButton("multipanel"))},
			},
			wantErr: false,
		},
		{
			name: "select menu mode: at budget (9 top level, reserve 1/2)",
			data: multiPanelCreateData{
				UsesComponentsV2: true,
				SelectMenu:       true,
				Components:       makeTree(9),
			},
			wantErr: false,
		},
		{
			name: "select menu mode: over budget",
			data: multiPanelCreateData{
				UsesComponentsV2: true,
				SelectMenu:       true,
				Components:       makeTree(10),
			},
			wantErr: true,
		},
		{
			name: "button mode, N=15 targets: tightest case, at budget (7 top level)",
			data: multiPanelCreateData{
				UsesComponentsV2: true,
				SelectMenu:       false,
				Panels:           panelsOfLen(15),
				Components:       makeTree(7),
			},
			wantErr: false, // reserves rows=3, total=18; 7+3=10, 7+18=25
		},
		{
			name: "button mode, N=15 targets: one top-level component too many",
			data: multiPanelCreateData{
				UsesComponentsV2: true,
				SelectMenu:       false,
				Panels:           panelsOfLen(15),
				Components:       makeTree(8),
			},
			wantErr: true, // 8+3=11 > 10
		},
		{
			name: "button mode, malicious tree rejected outright regardless of budget",
			data: multiPanelCreateData{
				UsesComponentsV2: true,
				SelectMenu:       false,
				Panels:           panelsOfLen(2),
				Components:       []component.Component{systemCustomIdButton("attacker")},
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateMultiPanelComponents(tt.data)
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func panelButton(panelId *int, customId string, url *string) component.Component {
	return component.BuildButton(component.Button{
		Label:    "x",
		Style:    component.ButtonStylePrimary,
		CustomId: customId,
		Url:      url,
		PanelId:  panelId,
	})
}

func intPtr(n int) *int { return &n }

// TestIsPanelButton covers the load-bearing security rule for panel placement: a button
// is only ever treated as a panel placeholder when it carries no client-supplied
// custom_id/url and its PanelId is a member of validPanelIds. A component that smuggles
// both a custom_id and a panel_id must never be accepted.
func TestIsPanelButton(t *testing.T) {
	validIds := map[int]bool{1: true, 2: true}

	tests := []struct {
		name string
		c    component.Component
		want bool
	}{
		{
			name: "valid panel-id-only button",
			c:    panelButton(intPtr(1), "", nil),
			want: true,
		},
		{
			name: "panel id not in the valid set",
			c:    panelButton(intPtr(99), "", nil),
			want: false,
		},
		{
			name: "smuggled custom_id alongside a valid panel_id is rejected outright",
			c:    panelButton(intPtr(1), "attacker_defined_id", nil),
			want: false,
		},
		{
			name: "smuggled url alongside a valid panel_id is rejected outright",
			c:    panelButton(intPtr(1), "", strPtr("https://example.com")),
			want: false,
		},
		{
			name: "no panel_id at all is not a panel button",
			c:    panelButton(nil, "", nil),
			want: false,
		},
		{
			name: "not a button at all",
			c:    component.BuildTextDisplay(component.TextDisplay{Content: "hi"}),
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, isPanelButton(tt.c, validIds))
		})
	}
}

// TestIsPanelSelect confirms the panel-select placeholder is only recognised when the
// multi-panel is actually in dropdown mode, and only for a clean placeholder node (no
// custom_id, no options already attached).
func TestIsPanelSelect(t *testing.T) {
	placeholder := component.BuildSelectMenu(component.SelectMenu{IsPanelSelect: true})

	tests := []struct {
		name             string
		c                component.Component
		selectMenuModeOn bool
		want             bool
	}{
		{
			name:             "valid placeholder in dropdown mode",
			c:                placeholder,
			selectMenuModeOn: true,
			want:             true,
		},
		{
			name:             "same placeholder rejected outright when not in dropdown mode",
			c:                placeholder,
			selectMenuModeOn: false,
			want:             false,
		},
		{
			name: "custom_id already set is not a clean placeholder",
			c: component.BuildSelectMenu(component.SelectMenu{
				IsPanelSelect: true,
				CustomId:      "attacker_select",
			}),
			selectMenuModeOn: true,
			want:             false,
		},
		{
			name: "options already populated is not a clean placeholder",
			c: component.BuildSelectMenu(component.SelectMenu{
				IsPanelSelect: true,
				Options:       []component.SelectOption{{Label: "a", Value: "a"}},
			}),
			selectMenuModeOn: true,
			want:             false,
		},
		{
			name:             "IsPanelSelect not set at all",
			c:                component.BuildSelectMenu(component.SelectMenu{CustomId: "x"}),
			selectMenuModeOn: true,
			want:             false,
		},
		{
			name:             "not a select menu at all",
			c:                component.BuildTextDisplay(component.TextDisplay{Content: "hi"}),
			selectMenuModeOn: true,
			want:             false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, isPanelSelect(tt.c, tt.selectMenuModeOn))
		})
	}
}

// TestCollectPlacedPanelIds covers duplicate-placement detection, the panel-select
// one-only rule, and the happy path across a nested tree.
func TestCollectPlacedPanelIds(t *testing.T) {
	t.Run("clean tree with buttons in an action row and one nested in a section", func(t *testing.T) {
		tree := []component.Component{
			component.BuildActionRow(panelButton(intPtr(1), "", nil), panelButton(intPtr(2), "", nil)),
			component.BuildContainer(component.Container{
				Components: []component.Component{
					component.BuildSection(component.Section{
						Components: []component.Component{component.BuildTextDisplay(component.TextDisplay{Content: "hi"})},
						Accessory:  panelButton(intPtr(3), "", nil),
					}),
				},
			}),
		}

		placed, hasSelect, err := collectPlacedPanelIds(tree)
		require.NoError(t, err)
		require.False(t, hasSelect)
		require.Equal(t, map[int]bool{1: true, 2: true, 3: true}, placed)
	})

	t.Run("clean tree with exactly one panel-select placeholder", func(t *testing.T) {
		tree := []component.Component{
			component.BuildActionRow(panelButton(intPtr(1), "", nil)),
			component.BuildSelectMenu(component.SelectMenu{IsPanelSelect: true}),
		}

		placed, hasSelect, err := collectPlacedPanelIds(tree)
		require.NoError(t, err)
		require.True(t, hasSelect)
		require.Equal(t, map[int]bool{1: true}, placed)
	})

	t.Run("duplicate panel_id across two placements is rejected", func(t *testing.T) {
		tree := []component.Component{
			component.BuildActionRow(panelButton(intPtr(1), "", nil)),
			component.BuildContainer(component.Container{
				Components: []component.Component{
					component.BuildActionRow(panelButton(intPtr(1), "", nil)),
				},
			}),
		}

		_, _, err := collectPlacedPanelIds(tree)
		require.Error(t, err)
	})

	t.Run("two panel-select placeholders is rejected", func(t *testing.T) {
		tree := []component.Component{
			component.BuildSelectMenu(component.SelectMenu{IsPanelSelect: true}),
			component.BuildSelectMenu(component.SelectMenu{IsPanelSelect: true}),
		}

		_, _, err := collectPlacedPanelIds(tree)
		require.Error(t, err)
	})

	t.Run("no placements at all", func(t *testing.T) {
		tree := []component.Component{component.BuildTextDisplay(component.TextDisplay{Content: "hi"})}

		placed, hasSelect, err := collectPlacedPanelIds(tree)
		require.NoError(t, err)
		require.False(t, hasSelect)
		require.Empty(t, placed)
	})
}

func testPanelWithCustomization(panelId int, buttonLabel, customId string) database.PanelWithCustomization {
	return database.PanelWithCustomization{
		Panel: database.Panel{
			PanelId:     panelId,
			ButtonLabel: buttonLabel,
			CustomId:    customId,
			ButtonStyle: int(component.ButtonStylePrimary),
		},
	}
}

// TestBuildSystemComponents_PlacedPanelsExcluded confirms buildSystemComponents never
// duplicates a panel that has already been placed inside the guild-authored tree, in
// both button mode and dropdown mode, and returns nil rather than an empty slice once
// every panel has been placed.
func TestBuildSystemComponents_PlacedPanelsExcluded(t *testing.T) {
	panels := []database.PanelWithCustomization{
		testPanelWithCustomization(1, "One", "custom-1"),
		testPanelWithCustomization(2, "Two", "custom-2"),
	}

	t.Run("button mode: all panels placed returns nil, not an empty slice", func(t *testing.T) {
		d := multiPanelMessageData{
			UsesComponentsV2: true,
			Components: []component.Component{
				component.BuildActionRow(panelButton(intPtr(1), "", nil), panelButton(intPtr(2), "", nil)),
			},
		}

		got := d.buildSystemComponents(panels)
		require.Nil(t, got)
	})

	t.Run("button mode: one panel placed leaves the other in the default row", func(t *testing.T) {
		d := multiPanelMessageData{
			UsesComponentsV2: true,
			Components: []component.Component{
				component.BuildActionRow(panelButton(intPtr(1), "", nil)),
			},
		}

		got := d.buildSystemComponents(panels)
		require.Len(t, got, 1)

		row, ok := got[0].ComponentData.(component.ActionRow)
		require.True(t, ok)
		require.Len(t, row.Components, 1)

		button, ok := row.Components[0].ComponentData.(component.Button)
		require.True(t, ok)
		require.Equal(t, "custom-2", button.CustomId)
	})

	t.Run("dropdown mode: the placed panel-select consumes both panels, default row is nil", func(t *testing.T) {
		d := multiPanelMessageData{
			UsesComponentsV2: true,
			SelectMenu:       true,
			Components: []component.Component{
				component.BuildSelectMenu(component.SelectMenu{IsPanelSelect: true}),
			},
		}

		got := d.buildSystemComponents(panels)
		require.Nil(t, got)
	})

	t.Run("classic mode ignores Components entirely: nothing is treated as placed", func(t *testing.T) {
		d := multiPanelMessageData{
			UsesComponentsV2: false,
			Components: []component.Component{
				component.BuildActionRow(panelButton(intPtr(1), "", nil)),
			},
		}

		got := d.buildSystemComponents(panels)
		require.Len(t, got, 1)

		row, ok := got[0].ComponentData.(component.ActionRow)
		require.True(t, ok)
		require.Len(t, row.Components, 2)
	})

	t.Run("no placement at all: both panels appear in the default row", func(t *testing.T) {
		d := multiPanelMessageData{UsesComponentsV2: true}

		got := d.buildSystemComponents(panels)
		require.Len(t, got, 1)

		row, ok := got[0].ComponentData.(component.ActionRow)
		require.True(t, ok)
		require.Len(t, row.Components, 2)
	})
}

// TestResolveComponentTreePanelRefs_ClearsPlaceholderMarkers confirms a resolved button
// carries a real custom_id and no PanelId, and a resolved select carries the system
// custom_id, the unplaced panels as options, and IsPanelSelect cleared.
func TestResolveComponentTreePanelRefs_ClearsPlaceholderMarkers(t *testing.T) {
	panels := []database.PanelWithCustomization{
		testPanelWithCustomization(1, "One", "custom-1"),
		testPanelWithCustomization(2, "Two", "custom-2"),
	}

	tree := []component.Component{
		component.BuildActionRow(panelButton(intPtr(1), "", nil)),
		component.BuildSelectMenu(component.SelectMenu{IsPanelSelect: true}),
	}

	resolved := resolveComponentTreePanelRefs(tree, panels)
	require.Len(t, resolved, 2)

	row, ok := resolved[0].ComponentData.(component.ActionRow)
	require.True(t, ok)
	require.Len(t, row.Components, 1)

	button, ok := row.Components[0].ComponentData.(component.Button)
	require.True(t, ok)
	require.Equal(t, "custom-1", button.CustomId)
	require.Nil(t, button.PanelId)

	sm, ok := resolved[1].ComponentData.(component.SelectMenu)
	require.True(t, ok)
	require.Equal(t, "multipanel", sm.CustomId)
	require.False(t, sm.IsPanelSelect)
	// Panel 1 was placed as a button, so only panel 2 remains for the dropdown.
	require.Len(t, sm.Options, 1)
	require.Equal(t, "custom-2", sm.Options[0].Value)
}

// TestResolveComponentTreePanelRefs_DropsSelectWithNoPanelsLeft covers a placed
// panel-select whose remaining panels have all disappeared since the tree was saved (for
// example the last unplaced panel was deleted from the guild via paneldelete.go). Discord
// rejects a select menu with zero options, so the resolved output must drop the node
// rather than emit one, and the parent action row must drop with it.
func TestResolveComponentTreePanelRefs_DropsSelectWithNoPanelsLeft(t *testing.T) {
	panels := []database.PanelWithCustomization{
		testPanelWithCustomization(1, "One", "custom-1"),
	}

	tree := []component.Component{
		component.BuildActionRow(panelButton(intPtr(1), "", nil)),
		component.BuildActionRow(component.BuildSelectMenu(component.SelectMenu{IsPanelSelect: true})),
	}

	resolved := resolveComponentTreePanelRefs(tree, panels)
	require.Len(t, resolved, 1, "the select's action row must be dropped, leaving only the button's row")

	row, ok := resolved[0].ComponentData.(component.ActionRow)
	require.True(t, ok)
	require.Len(t, row.Components, 1)

	button, ok := row.Components[0].ComponentData.(component.Button)
	require.True(t, ok)
	require.Equal(t, "custom-1", button.CustomId)
}

// TestValidateMultiPanelComponents_PlacedPanelReservation covers the reservation formula
// once panels are placed inside the tree: a placed panel-select reserves zero extra
// budget (it's already counted as part of the authored tree), and placed buttons shrink
// the button-mode row reservation to just the panels left unplaced.
func TestValidateMultiPanelComponents_PlacedPanelReservation(t *testing.T) {
	panelsOfLen := func(n int) []panelConfiguration {
		panels := make([]panelConfiguration, n)
		for i := range panels {
			panels[i] = panelConfiguration{PanelId: i}
		}
		return panels
	}

	t.Run("dropdown mode, panel-select placed in the tree: reserves nothing extra", func(t *testing.T) {
		// 9 top-level text displays + 1 row containing the placed select = 10 top level,
		// at budget with zero reservation; without the fix this would reserve an extra
		// 1/2 and fail.
		tree := make([]component.Component, 9)
		for i := range tree {
			tree[i] = component.BuildTextDisplay(component.TextDisplay{Content: fmt.Sprintf("x%d", i)})
		}
		tree = append(tree, component.BuildActionRow(component.BuildSelectMenu(component.SelectMenu{IsPanelSelect: true})))

		data := multiPanelCreateData{
			UsesComponentsV2: true,
			SelectMenu:       true,
			Panels:           panelsOfLen(3),
			Components:       tree,
		}

		require.NoError(t, validateMultiPanelComponents(data))
	})

	t.Run("dropdown mode: placing the select with zero panels left unplaced is rejected", func(t *testing.T) {
		data := multiPanelCreateData{
			UsesComponentsV2: true,
			SelectMenu:       true,
			Panels:           panelsOfLen(1),
			Components: []component.Component{
				component.BuildActionRow(panelButton(intPtr(0), "", nil)),
				component.BuildActionRow(component.BuildSelectMenu(component.SelectMenu{IsPanelSelect: true})),
			},
		}

		require.Error(t, validateMultiPanelComponents(data))
	})

	t.Run("button mode: placed panels shrink the row reservation to the unplaced remainder", func(t *testing.T) {
		// 15 targets, 1 placed directly as a button in the tree: 14 remain for the
		// default row, needing 3 rows (ceil(14/5)) instead of the full 3 rows for 15 -
		// exercised here at the boundary where 8 top-level components would have failed
		// against the un-adjusted (3, 18) reservation for 15 panels, but now the eighth
		// slot is the placed button itself, leaving only 7 "real" tree entries plus the
		// placed button = 8, reserving rows=ceil(14/5)=3, so 8+3=11 fails; drop to 7 tree
		// entries (6 filler + 1 placed button) so 7+3=10 passes.
		tree := make([]component.Component, 6)
		for i := range tree {
			tree[i] = component.BuildTextDisplay(component.TextDisplay{Content: fmt.Sprintf("x%d", i)})
		}
		tree = append(tree, component.BuildActionRow(panelButton(intPtr(0), "", nil)))

		data := multiPanelCreateData{
			UsesComponentsV2: true,
			SelectMenu:       false,
			Panels:           panelsOfLen(15),
			Components:       tree,
		}

		require.NoError(t, validateMultiPanelComponents(data))
	})
}
