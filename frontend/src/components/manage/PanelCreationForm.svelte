<script>
    import Input from "../form/Input.svelte";
    import Textarea from "../form/Textarea.svelte";
    import Colour from "../form/Colour.svelte";
    import ChannelDropdown from "../ChannelDropdown.svelte";

    import { onMount } from "svelte";
    import { colourToInt, intToColour } from "../../js/util";
    import CategoryDropdown from "../CategoryDropdown.svelte";
    import EmojiInput from "../form/EmojiInput.svelte";
    import Dropdown from "../form/Dropdown.svelte";
    import Toggle from "svelte-toggle";
    import Checkbox from "../form/Checkbox.svelte";
    import Collapsible from "../Collapsible.svelte";
    import EmbedForm from "../EmbedForm.svelte";
    import WrappedSelect from "../WrappedSelect.svelte";
    import AccessControlList from "./AccessControlList.svelte";
    import { DOCS_URL } from "../../js/constants";
    import SupportHoursForm from "./SupportHoursForm.svelte";

    export let guildId;
    export let seedDefault = true;

    let tempColour = "#2ECC71";

    export let data = {};

    export let channels = [];
    export let roles = [];
    export let emojis = [];
    export let teams = [];
    export let forms = [];
    export let isPremium = false;

    let teamsWithDefault = [];
    let mentionItems = [];

    let selectedTeams = seedDefault ? [{ id: "default", name: "Default" }] : [];
    let selectedMentions = [];

    // Replace spaces with dashes in naming scheme as the user types
    $: if (
        data.naming_scheme !== undefined &&
        data.naming_scheme !== null &&
        data.naming_scheme.includes(" ")
    ) {
        data.naming_scheme = data.naming_scheme.replaceAll(" ", "-");
    }

    function updateMentions() {
        if (selectedMentions === undefined) {
            selectedMentions = [];
        }

        data.mentions = selectedMentions.map((option) => option.id);
    }

    function updateTeams() {
        if (selectedTeams === undefined) {
            selectedTeams = [];

            data.default_team = false;
            data.teams = [];
        } else {
            data.default_team =
                selectedTeams.find((option) => option.id === "default") !==
                undefined;
            data.teams = selectedTeams
                .filter((option) => option.id !== "default")
                .map((option) => parseInt(option.id));
        }
    }

    const nameMapper = (team) => team.name;
    const emojiNameMapper = (emoji) => `:${emoji.name}:`;

    function mentionNameMapper(role) {
        if (role.id === "user" || role.id == "here" || role.id == guildId) {
            return role.name;
        } else {
            return `@${role.name}`;
        }
    }

    function handleEmojiTypeChange(e) {
        let isCustomEmoji = e.detail;
        if (isCustomEmoji) {
            data.emote = undefined;
        } else {
            data.emote = "📩";
        }
    }

    function handleCustomEmojiChange(e) {
        let emoji = e.detail;
        data.emote = {
            id: emoji.id,
            name: emoji.name,
        };
    }

    function updateColour() {
        data.colour = colourToInt(tempColour);
    }

    function handleSupportHoursChange(e) {
        data.support_hours = e.detail;
    }

    function updateMentionValues() {
        mentionItems = [
            { id: "user", name: "Ticket Opener" },
            { id: "here", name: "@here" },
            ...roles,
        ];
    }

    function updateTeamsItems() {
        teamsWithDefault = [{ id: "default", name: "Default" }, ...teams];
    }

    function applyOverrides() {
        if (data.default_team === true) {
            selectedTeams.push({ id: "default", name: "Default" });
        }

        if (data.teams) {
            data.teams
                .map((id) => teams.find((team) => team.id === id))
                .forEach((team) => selectedTeams.push(team));
        }

        if (data.mentions) {
            data.mentions
                .map((id) => mentionItems.find((role) => role.id === id))
                .filter((mention) => mention != null)
                .forEach((mention) => selectedMentions.push(mention));
        }
        
        if (!data.transcript_channel_id) {
            data.transcript_channel_id = "null";
        }

        if (!data.form_id) {
            data.form_id = "null";
        }

        if (!data.exit_survey_form_id) {
            data.exit_survey_form_id = "null";
        }

        if (!data.pending_category) {
            data.pending_category = "null";
        }

        data.emote = data.emote;

        if (!data.colour) {
            data.colour = 0x2ecc71;
        }

        tempColour = intToColour(data.colour);
    }

    onMount(() => {
        updateMentionValues();
        updateTeamsItems();

        if (seedDefault) {
            data = {
                //title: 'Open a ticket!',
                //content: 'By clicking the button, a ticket will be opened for you.',
                colour: 0x2ecc71,
                use_custom_emoji: false,
                emote: "📩",
                mentions: [],
                default_team: true,
                teams: [],
                button_style: "1",
                form_id: "null",
                delete_mentions: false,
                disabled: false,
                channel_id: channels.find((c) => c.type === 0 || c.type === 5)
                    ?.id,
                category_id: channels.find((c) => c.type === 4)?.id,
                transcript_channel_id: "null",
                use_server_default_naming_scheme: true,
                exit_survey_form_id: "null",
                pending_category: "null",
                welcome_message: {
                    fields: [],
                    colour: "#2ECC71",
                    author: {},
                    footer: {},
                    description:
                        "Thank you for contacting support.\nPlease describe your issue and wait for a response.",
                },
                access_control_list: [
                    {
                        role_id: guildId,
                        action: "allow",
                    },
                ],
            };
        } else {
            applyOverrides();
        }
    });
</script>

<form class="settings-form" on:submit|preventDefault>
    <Collapsible defaultOpen>
        <span slot="header">Ticket Properties</span>
        <div slot="content" class="col-1">
            <div class="row">
                <div class="col-2">
                    <label class="form-label">Mention On Open</label>
                    <div class="col-1">
                        <WrappedSelect
                            items={mentionItems}
                            bind:selectedValue={selectedMentions}
                            on:input={updateMentions}
                            optionIdentifier="id"
                            nameMapper={mentionNameMapper}
                            placeholder="Select roles..."
                            isMulti={true}
                        />
                    </div>
                </div>
                <div class="col-2">
                    <label class="form-label">Support Teams</label>
                    <WrappedSelect
                        items={teamsWithDefault}
                        bind:selectedValue={selectedTeams}
                        on:input={updateTeams}
                        optionIdentifier="id"
                        {nameMapper}
                        placeholder="Select teams..."
                        isMulti={true}
                    >
                        <div slot="item" let:item>{item.name}</div>
                        <div slot="selection" let:selection>
                            {selection.name}
                        </div>
                    </WrappedSelect>
                </div>
            </div>
            <div class="row">
                <ChannelDropdown
                    withNull
                    nullLabel="Use Global Setting"
                    col3
                    label="Transcript Channel"
                    allowAnnouncementChannel
                    {channels}
                    bind:value={data.transcript_channel_id}
                />
                <Checkbox
                    label="Delete Mentions (Delete mentions after ticket opening)"
                    col2
                    tool
                    bind:value={data.delete_mentions}
                />
            </div>
            <div class="incomplete-row">
                <CategoryDropdown
                    label="Ticket Category"
                    col3
                    {channels}
                    bind:value={data.category_id}
                />

                <Dropdown col4 label="Form" bind:value={data.form_id}>
                    <option value="null">None</option>
                    {#each forms as form}
                        <option value={form.form_id}>{form.title}</option>
                    {/each}
                </Dropdown>
            </div>
            <div class="incomplete-row">
                <Dropdown
                    col4
                    label="Naming Scheme"
                    bind:value={data.use_server_default_naming_scheme}
                >
                    <option value={true}>Use Server Default</option>
                    <option value={false}>Custom</option>
                </Dropdown>

                {#if !data.use_server_default_naming_scheme}
                    <Input
                        col4
                        label="Custom Naming Scheme"
                        bind:value={data.naming_scheme}
                        placeholder="ticket-%id%"
                        tooltipText="Click here for the full placeholder list"
                        tooltipLink={`${DOCS_URL}/dashboard/settings/placeholders#custom-naming-scheme-placeholders`}
                    />
                {/if}
            </div>
            <div class="incomplete-row">
                <Dropdown
                    col3
                    label="Exit Survey Form"
                    premiumBadge={true}
                    bind:value={data.exit_survey_form_id}
                    disabled={!isPremium}
                >
                    <option value="null">None</option>
                    {#each forms as form}
                        <option value={form.form_id}>{form.title}</option>
                    {/each}
                </Dropdown>
                <Dropdown
                    col3
                    label="Awaiting Response Category"
                    premiumBadge={true}
                    bind:value={data.pending_category}
                    disabled={!isPremium}
                >
                    <option value="null">Disabled</option>
                    {#each channels as channel}
                        {#if channel.type === 4}
                            <option value={channel.id}>{channel.name}</option>
                        {/if}
                    {/each}
                </Dropdown>
            </div>
        </div>
    </Collapsible>

    <Collapsible defaultOpen>
        <span slot="header">Panel Message</span>
        <div slot="content" class="col-1">
            <div class="row">
                <div class="col-1-3">
                    <Input
                        label="Panel Title"
                        placeholder="Open a ticket!"
                        col1="true"
                        bind:value={data.title}
                    />
                </div>
                <div class="col-2-3">
                    <Textarea
                        col1="true"
                        label="Panel Content"
                        placeholder="By clicking the button, a ticket will be opened for you."
                        bind:value={data.content}
                    />
                </div>
            </div>

            <div class="row">
                <Colour
                    col4="true"
                    label="Panel Colour"
                    on:change={updateColour}
                    bind:value={tempColour}
                />
                <ChannelDropdown
                    label="Panel Channel"
                    allowAnnouncementChannel
                    col4
                    {channels}
                    bind:value={data.channel_id}
                />
                <div class="col-2">
                    <div
                        class="row"
                        style="justify-content: flex-start; gap: 10px"
                    >
                        <div style="white-space: nowrap">
                            <Checkbox
                                label="Disable Panel"
                                bind:value={data.disabled}
                            ></Checkbox>
                        </div>
                        {#if data.disabled}
                            <b style="display: flex; align-self: center"
                                >You will be unable to open any tickets with
                                this panel</b
                            >
                        {/if}
                    </div>
                </div>
            </div>

            <div class="row">
                <Dropdown
                    col4="true"
                    label="Button Colour"
                    bind:value={data.button_style}
                >
                    <option value="1">Blue</option>
                    <option value="2">Grey</option>
                    <option value="3">Green</option>
                    <option value="4">Red</option>
                </Dropdown>

                <Input
                    col4={true}
                    label="Button Text"
                    placeholder="Open a ticket!"
                    bind:value={data.button_label}
                />

                <div class="col-2" style="z-index: 1">
                    <label for="emoji-pick-wrapper" class="form-label"
                        >Button Emoji</label
                    >
                    <div id="emoji-pick-wrapper" class="row" style="gap: 2%">
                        <div class="col">
                            <label
                                class="form-label"
                                style="margin-bottom: 0 !important; white-space: nowrap;"
                                >Custom Emoji</label
                            >
                            <Toggle
                                hideLabel
                                toggledColor="#66bb6a"
                                untoggledColor="#ccc"
                                bind:toggled={data.use_custom_emoji}
                                on:toggle={handleEmojiTypeChange}
                            />
                        </div>
                        {#if data.use_custom_emoji}
                            <div class="col-fill">
                                <!--Item=EmojiItem-->
                                <WrappedSelect
                                    items={emojis}
                                    selectedValue={data.emote}
                                    optionIdentifier="id"
                                    nameMapper={emojiNameMapper}
                                    placeholderAlwaysShow={true}
                                    on:input={handleCustomEmojiChange}
                                />
                            </div>
                        {:else}
                            <EmojiInput col1="true" bind:value={data.emote} />
                        {/if}
                    </div>
                </div>
            </div>

            <div class="row">
                <Input
                    col2={true}
                    label="Large Image URL"
                    badge="Optional"
                    bind:value={data.image_url}
                    placeholder="https://example.com/image.png"
                />
                <Input
                    col2={true}
                    label="Small Image URL"
                    badge="Optional"
                    bind:value={data.thumbnail_url}
                    placeholder="https://example.com/image.png"
                />
            </div>
        </div>
    </Collapsible>

    <Collapsible>
        <span slot="header">Welcome Message</span>
        <div slot="content" class="col-1">
            <div class="row">
                <EmbedForm bind:data={data.welcome_message} />
            </div>
        </div>
    </Collapsible>

    <Collapsible>
        <span slot="header">Access Control</span>
        <div slot="content" class="col-1">
            <div class="row">
                <p>
                    Control who can open tickets with from this panel. Rules are
                    evaluated from <em>top to bottom</em>, stopping after the
                    first match.
                </p>
            </div>
            <div class="row">
                <AccessControlList
                    {guildId}
                    {roles}
                    bind:acl={data.access_control_list}
                />
            </div>
        </div>
    </Collapsible>

    <Collapsible>
        <span slot="header"
            >Support Hours {#if !isPremium}<span class="free-badge"
                    >1 Panel Free</span
                >{/if}</span
        >
        <div slot="content" class="col-1" style="padding-top: 10px;">
            {#if !false}
                <div class="free-feature-notice">
                    <i class="fas fa-clock"></i>
                    <div class="feature-notice-text">
                        <strong>Free: 1 Panel • Premium: Unlimited</strong>
                        <span
                            >Configure operating hours for when tickets can be
                            opened. Free users can set support hours on one
                            panel, premium users get unlimited panels with
                            support hours.</span
                        >
                    </div>
                </div>
            {/if}
            <div class="row">
                <p>
                    Optionally restrict when tickets can be opened from this
                    panel. If no hours are set, the panel will be available
                    24/7.
                </p>
            </div>
            <div class="row">
                <SupportHoursForm
                    bind:data={data.support_hours}
                    on:change={handleSupportHoursChange}
                />
            </div>
        </div>
    </Collapsible>
</form>

<style>
    .row {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        width: 100%;
        margin-bottom: 10px;
    }

    .incomplete-row {
        display: flex;
        flex-direction: row;
        gap: 10px;
        width: 100%;
        margin-bottom: 10px;
    }

    form {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
    }

    .premium-badge {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        margin-left: 8px;
        display: inline-block;
    }

    .free-badge {
        background: linear-gradient(135deg, #4fc3f7 0%, #81c784 100%);
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        margin-left: 8px;
        display: inline-block;
    }

    .premium-notice,
    .free-feature-notice {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        padding: 16px;
        background: rgba(102, 126, 234, 0.1);
        border: 1px solid rgba(102, 126, 234, 0.3);
        border-radius: 8px;
        margin-bottom: 16px;
    }

    .free-feature-notice {
        background: rgba(79, 195, 247, 0.1);
        border-color: rgba(79, 195, 247, 0.3);
    }

    .premium-notice i {
        color: #667eea;
        font-size: 24px;
        margin-top: 4px;
    }

    .free-feature-notice i {
        color: #4fc3f7;
        font-size: 24px;
        margin-top: 4px;
    }

    .premium-notice-text,
    .feature-notice-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .premium-notice-text strong,
    .feature-notice-text strong {
        color: rgba(255, 255, 255, 0.95);
        font-size: 16px;
    }

    .premium-notice-text span,
    .feature-notice-text span {
        color: rgba(255, 255, 255, 0.7);
        font-size: 14px;
        line-height: 1.5;
    }

    .col {
        display: flex;
        flex-direction: column;
    }

    .col-fill {
        display: flex;
        flex-direction: column;
        flex-grow: 1;
    }

    :global(.col-1-3) {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        width: 32%;
        height: 100%;
    }

    :global(.col-2-3) {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        width: 64%;
        height: 100%;
    }

    @media only screen and (max-width: 950px) {
        .row {
            flex-direction: column;
            justify-content: center;
        }
        :global(.col-1-3, .col-2-3) {
            width: 100% !important;
        }
    }

    :global(.advanced-settings) {
        transition:
            min-height 0.3s ease-in-out,
            margin-top 0.3s ease-in-out,
            margin-bottom 0.3s ease-in-out;
        position: relative;
        overflow: hidden;
    }

    :global(.advanced-settings-hide) {
        height: 0;
        visibility: hidden;
        margin: 0;
        flex: unset;
        min-height: 0 !important;
    }

    :global(.show-overflow) {
        overflow: visible;
    }

    #naming-scheme-wrapper {
        gap: 10px;
    }
</style>
