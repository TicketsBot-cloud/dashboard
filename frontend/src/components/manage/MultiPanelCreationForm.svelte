<form on:submit|preventDefault>
    <Collapsible defaultOpen>
        <span slot="header">Multi-Panel Properties</span>
        <div slot="content" class="col-1">
            <div class="col-1">
                <ChannelDropdown col1 allowAnnouncementChannel {channels} label="Panel Channel"
                                 bind:value={data.channel_id}/>
            </div>
            <div class="col-1" style="padding-right: 10px">
                <PanelDropdown label="Panels (Minimum 2)" {panels} bind:selected={data.panels}/>
            </div>
            <div class="col-1">
                <div class="row dropdown-menu-settings">
                    <Checkbox label="Use Dropdown Menu" bind:value={data.select_menu}/>
                    <div class="placeholder-input">
                        <Input label="Dropdown Menu Placeholder" col1 placeholder="Select a topic..."
                               bind:value={data.select_menu_placeholder} disabled={!data.select_menu} />
                    </div>
                </div>
            </div>
        </div>
    </Collapsible>

    <Collapsible bind:this={customizationCollapsible} defaultOpen={anyPanelNeedsLabel}>
        <span slot="header">Panel Customization (Optional)</span>
        <div slot="content" class="col-1">
            {#if data.panels && data.panels.length > 0}
                {#each data.panels as panelId}
                    {@const panel = getPanelById(panelId)}
    
                    <div class="col-1 panel-config-row">
                        <div class="panel-header">
                            <span class="panel-title">
                                {panel?.title || `Panel ${panelId}`}
                            </span>
                        </div>
    
                        <div class="emoji-row">
                            <div class="emoji-toggle-section">
                                <label class="form-label">Custom Emoji</label>
                                <div class="emoji-toggle-row">
                                    <span class="toggle-label">Use Custom Emoji</span>
                                    <Toggle
                                        hideLabel
                                        toggledColor="#66bb6a"
                                        untoggledColor="#ccc"
                                        bind:toggled={panelCustomizations[panelId].use_custom_emoji}
                                        on:toggle={(e) => handleEmojiTypeChange(panelId, e.detail)}
                                    />
                                </div>
                            </div>
                            <div class="col-1">
                                {#if panelCustomizations[panelId].use_custom_emoji}
                                    <WrappedSelect
                                        items={emojis}
                                        selectedValue={panelCustomizations[panelId].custom_emoji_obj}
                                        optionIdentifier="id"
                                        nameMapper={emojiNameMapper}
                                        isSearchable={false}
                                        isClearable={false}
                                        on:input={(e) => handleCustomEmojiChange(panelId, e.detail)}
                                    />
                                {:else}
                                    <EmojiInput
                                        col1
                                        placeholder={panel && !panel.emoji_id ? panel.emoji_name : "Leave empty to use default emoji"}
                                        bind:value={panelCustomizations[panelId].custom_emoji_name}
                                    />
                                {/if}
                            </div>
                        </div>

                        <Input
                            col1
                            label="Custom Label"
                            placeholder={panel?.button_label || "Leave empty to use default"}
                            bind:value={panelCustomizations[panelId].custom_label}
                        />
    
                        {#if data.select_menu}
                            <Input
                                col1
                                label="Description"
                                placeholder="Optional description"
                                bind:value={panelCustomizations[panelId].description}
                            />
                        {/if}
    
                        {#if panelNeedsLabel(panelId)}
                            <div class="validation-error">
                                <i class="fas fa-exclamation-triangle"></i>
                                <span>This panel must have a label when using dropdown mode. Please add a custom label or ensure the panel has a button label.</span>
                            </div>
                        {/if}
                    </div>
                {/each}
            {:else}
                <p class="hint">No panels selected for customization.</p>
            {/if}
        </div>
    </Collapsible>

    <Collapsible defaultOpen>
        <span slot="header">Panel Message</span>
        <div slot="content" class="col-1">
            <EmbedForm footerPremiumOnly={true} bind:data={data.embed}/>
        </div>
    </Collapsible>
</form>

<script>
    import { onMount } from "svelte";
    import ChannelDropdown from "../ChannelDropdown.svelte";
    import PanelDropdown from "../PanelDropdown.svelte";
    import Checkbox from "../form/Checkbox.svelte";
    import Collapsible from "../Collapsible.svelte";
    import EmbedForm from "../EmbedForm.svelte";
    import Input from "../form/Input.svelte";
    import EmojiInput from "../form/EmojiInput.svelte";
    import WrappedSelect from "../WrappedSelect.svelte";
    import Toggle from "svelte-toggle";
    import emojiRegex from "emoji-regex";

    export let data;
    export let panelCustomizations = {};

    export let channels = [];
    export let panels = [];
    export let emojis = [];

    export let seedDefault = true;

    let customizationCollapsible;
    if (seedDefault) {
        const firstChannel = channels[0];

        data = {
            channels: firstChannel ? firstChannel.id : undefined,
            panels: [],
            embed: {
                title: 'Open a ticket!',
                fields: [],
                colour: 0x2ECC71,
                author: {},
                footer: {},
            },
        }
    }

    function getPanelById(panelId) {
        return panels.find(p => p.panel_id === panelId);
    }

    // Emoji validation
    function validateUnicodeEmoji(value) {
        if (value === "") return true;
        const matches = value.match(emojiRegex());
        return matches !== null && matches.length === 1 && matches[0] === value;
    }

    // Emoji handlers per panel
    const emojiNameMapper = (emoji) => `:${emoji.name}:`;

    function handleEmojiTypeChange(panelId, isCustomEmoji) {
        if (!panelCustomizations[panelId]) return;

        if (isCustomEmoji) {
            // Switch to custom emoji
            panelCustomizations[panelId].use_custom_emoji = true;
            // Set to first emoji or restore previous custom emoji
            if (emojis && emojis.length > 0) {
                panelCustomizations[panelId].custom_emoji_obj = emojis[0];
                panelCustomizations[panelId].custom_emoji_name = emojis[0].name;
                panelCustomizations[panelId].custom_emoji_id = emojis[0].id;
            }
        } else {
            // Switch to unicode emoji
            panelCustomizations[panelId].use_custom_emoji = false;
            panelCustomizations[panelId].custom_emoji_name = "";
            panelCustomizations[panelId].custom_emoji_id = null;
        }
    }

    function handleCustomEmojiChange(panelId, emoji) {
        if (!panelCustomizations[panelId]) return;
        panelCustomizations[panelId].custom_emoji_obj = emoji;
        panelCustomizations[panelId].custom_emoji_name = emoji.name;
        panelCustomizations[panelId].custom_emoji_id = emoji.id;
    }

    // Track last valid unicode emoji per panel
    let lastValidUnicodeEmojis = {};

    // Reactive validation: Revert to last valid emoji if invalid input is detected
    $: if (panelCustomizations && data.panels) {
        data.panels.forEach(panelId => {
            const customization = panelCustomizations[panelId];
            if (!customization) return;

            // Only validate unicode emojis
            if (!customization.use_custom_emoji && typeof customization.custom_emoji_name === "string") {
                const emojiValue = customization.custom_emoji_name;

                if (validateUnicodeEmoji(emojiValue)) {
                    // Valid emoji - save it as the last valid one
                    lastValidUnicodeEmojis[panelId] = emojiValue;
                } else {
                    // Invalid emoji - revert to last valid one
                    const lastValid = lastValidUnicodeEmojis[panelId] || "";
                    panelCustomizations[panelId].custom_emoji_name = lastValid;
                }
            }
        });
    }

    // Initialize customizations when panels change
    $: if (data.panels) {
        // Preserve existing customizations, add new panels
        data.panels.forEach(panelId => {
            if (!panelCustomizations[panelId]) {
                panelCustomizations[panelId] = {
                    custom_emoji_name: "",
                    custom_emoji_id: null,
                    custom_emoji_obj: null,
                    use_custom_emoji: false,
                    custom_label: "",
                    description: ""
                };
            }
        });
        // Remove customizations for unselected panels
        Object.keys(panelCustomizations).forEach(panelId => {
            if (!data.panels.includes(parseInt(panelId))) {
                delete panelCustomizations[panelId];
            }
        });
    }

    // Validation: Check if panels have labels when using dropdown mode
    function getEffectiveLabel(panelId) {
        const panel = getPanelById(panelId);
        const customLabel = panelCustomizations[panelId]?.custom_label;

        if (customLabel && customLabel.trim() !== "") {
            return customLabel.trim();
        }

        return panel?.button_label || "";
    }

    function panelNeedsLabel(panelId) {
        return data.select_menu && getEffectiveLabel(panelId) === "";
    }

    // Check if any panel needs a label (missing both button_label AND custom_label)
    $: anyPanelNeedsLabel = data.panels && data.panels.length > 0 && data.panels.some(panelId => panelNeedsLabel(panelId));

    // Track which panels currently have errors to detect when new ones are added
    $: panelsWithErrors = data.panels ? data.panels.filter(panelId => panelNeedsLabel(panelId)) : [];

    // Watch for changes that should trigger auto-open
    let previousAnyPanelNeedsLabel = anyPanelNeedsLabel;
    let previousPanelsWithErrors = [];

    $: {
        // Detect if errors just appeared (dropdown turned on, or first error appeared)
        const errorsJustAppeared = anyPanelNeedsLabel && !previousAnyPanelNeedsLabel;

        // Detect if new panel with error was added (panel count with errors increased)
        const newErrorPanelAdded = panelsWithErrors.length > previousPanelsWithErrors.length;

        // Auto-open when: dropdown turned on with errors OR new panel with error added
        if ((errorsJustAppeared || newErrorPanelAdded) && customizationCollapsible) {
            customizationCollapsible.open();
        }

        previousAnyPanelNeedsLabel = anyPanelNeedsLabel;
        previousPanelsWithErrors = panelsWithErrors;
    }
</script>

<style>
    form {
        display: flex;
        flex-direction: column;
        width: 100%;
    }

    .row {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        width: 100%;
    }

    .dropdown-menu-settings {
        gap: 10px;
        margin-top: 10px;
    }

    .dropdown-menu-settings > .placeholder-input {
        flex: 1;
    }

    @media only screen and (max-width: 950px) {
        .row {
            flex-direction: column;
        }
    }

    :global(.col-1-4) {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        width: 25%;
        height: 100%;
    }

    :global(.col-3-4) {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        width: 75%;
        height: 100%;
    }

    .panel-config-row {
        margin: 0.5rem 0;
        gap: 10px;
        border: 1px solid var(--background-secondary);
        border-radius: 4px;
    }

    .panel-header {
        margin-bottom: 0.5rem;
    }

    .panel-title {
        font-weight: 600;
        font-size: 0.95rem;
    }

    .hint {
        color: var(--text-muted);
        font-size: 0.85rem;
        font-style: italic;
        display: block;
        margin-top: 0.5rem;
    }

    .validation-error {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        margin-top: 8px;
        background-color: rgba(255, 0, 0, 0.1);
        border: 1px solid rgba(255, 0, 0, 0.3);
        border-radius: 4px;
        color: #ff4444;
        font-size: 0.9rem;
    }

    .validation-error i {
        font-size: 1rem;
    }

    .emoji-row {
        display: flex;
        flex-direction: row;
        gap: 1rem;
        align-items: flex-start;
        width: 100%;
    }

    .emoji-toggle-section {
        display: flex;
        flex-direction: column;
        min-width: 200px;
    }

    .emoji-toggle-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .toggle-label {
        font-size: 0.9rem;
    }

    @media only screen and (max-width: 950px) {
        .emoji-row {
            flex-direction: column;
        }
    }
</style>
