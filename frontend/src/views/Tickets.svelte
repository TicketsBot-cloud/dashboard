<script>
    import Card from "../components/Card.svelte";
    import {
        getRelativeTime,
        notifyError,
        withLoadingScreen,
    } from "../js/util";
    import axios from "axios";
    import { API_URL } from "../js/constants";
    import { setDefaultHeaders } from "../includes/Auth.svelte";
    import Button from "../components/Button.svelte";
    import { Navigate } from "svelte-router-spa";
    import ColumnSelector from "../components/ColumnSelector.svelte";
    import Dropdown from "../components/form/Dropdown.svelte";
    import Checkbox from "../components/form/Checkbox.svelte";
    import Input from "../components/form/Input.svelte";
    import PanelDropdown from "../components/PanelDropdown.svelte";
    import { permissionLevelCache } from "../js/stores";

    export let currentRoute;
    let guildId = currentRoute.namedParams.id;

    let selectedColumns = [
        "ID",
        "Panel",
        "User",
        "Claimed By",
        "Last Message Time",
        "Awaiting Response",
        "Labels",
    ];
    let sortMethod = "unclaimed";
    let onlyShowMyTickets = false;

    let filterSettings = {};
    let panels = [];
    let selectedPanel;

    // Labels
    let labels = [];
    let selectedLabelIds = [];
    let showLabelManageModal = false;
    let newLabelName = "";
    let newLabelColour = "#4A4A4A";
    let labelAssignDropdownTicketId = null;

    // Permission level
    let isAdmin = false;
    $: {
        if ($permissionLevelCache[guildId]) {
            isAdmin = $permissionLevelCache[guildId].permission_level === 2;
        }
    }

    let data = {
        tickets: [],
        panel_titles: {},
        resolved_users: {},
        labels: {},
    };

    let filtered = [];

    function textColourForBg(hex) {
        const r = (hex >> 16) & 0xFF, g = (hex >> 8) & 0xFF, b = hex & 0xFF;
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
    }

    function intToHex(val) {
        return "#" + val.toString(16).padStart(6, "0");
    }

    function hexToInt(hex) {
        return parseInt(hex.replace("#", ""), 16);
    }

    let handleInputTicketId = () => {
        filterSettings.username = undefined;
        filterSettings.userId = undefined;

        if (filterSettings.ticketId === "") {
            filterSettings.ticketId = undefined;
        }
    };

    let handleInputUsername = () => {
        filterSettings.ticketId = undefined;
        filterSettings.userId = undefined;

        if (filterSettings.username === "") {
            filterSettings.username = undefined;
        }
    };

    let handleInputUserId = () => {
        filterSettings.ticketId = undefined;
        filterSettings.username = undefined;

        if (filterSettings.userId === "") {
            filterSettings.userId = undefined;
        }
    };

    let handleInputClaimedById = () => {
        if (filterSettings.claimedById == "") {
            filterSettings.claimedById = undefined;
        }
    };

    function filterTickets() {
        filtered = data.tickets.filter((ticket) => {
            if (onlyShowMyTickets) {
                return (
                    ticket.claimed_by === null ||
                    ticket.claimed_by === data.self_id
                );
            }

            return true;
        });

        // Apply sort
        if (sortMethod === "id_asc") {
            filtered.sort((a, b) => a.id - b.id);
        } else if (sortMethod === "id_desc") {
            filtered.sort((a, b) => b.id - a.id);
        } else if (sortMethod === "unclaimed") {
            filtered.sort((a, b) => {
                // Place unclaimed tickets at the top. The priority of fields used for sorting is:
                // 1. Unclaimed tickets, or tickets claimed by the current user
                // 2. Awaiting Response
                // 3. Last Response Time

                // Unclaimed tickets at the top
                if (a.claimed_by === null && b.claimed_by !== null) {
                    return -1;
                }
                if (a.claimed_by !== null && b.claimed_by === null) {
                    return 1;
                }

                if (
                    a.claimed_by === data.self_id &&
                    b.claimed_by !== data.self_id
                ) {
                    return -1;
                }
                if (
                    a.claimed_by !== data.self_id &&
                    b.claimed_by === data.self_id
                ) {
                    return 1;
                }

                // Among claimed tickets, those awaiting response at the top
                if (!a.last_response_is_staff && b.last_response_is_staff) {
                    return -1;
                }
                if (a.last_response_is_staff && !b.last_response_is_staff) {
                    return 1;
                }

                // Among tickets not awaiting response, sort by last response time
                const aLastResponseTime = new Date(a.last_response_time || 0);
                const bLastResponseTime = new Date(b.last_response_time || 0);

                return aLastResponseTime - bLastResponseTime;
            });
        }
    }

    async function applyFilters() {
        await loadTickets();
    }

    async function loadPanels() {
        const res = await axios.get(`${API_URL}/api/${guildId}/panels`);
        if (res.status !== 200) {
            notifyError(res.data);
            return;
        }

        panels = res.data;
    }

    async function loadLabels() {
        const res = await axios.get(`${API_URL}/api/${guildId}/ticket-labels`);
        if (res.status !== 200) {
            notifyError(res.data);
            return;
        }

        labels = res.data;
    }

    async function loadTickets() {
        const filterParams = {
            id: filterSettings.ticketId,
            username: filterSettings.username,
            user_id: filterSettings.userId,
            claimed_by_id: filterSettings.claimedById,
            panel_id: selectedPanel,
        };

        if (selectedLabelIds.length > 0) {
            filterParams.label_ids = selectedLabelIds;
        }

        const res = await axios.post(
            `${API_URL}/api/${guildId}/tickets`,
            filterParams
        );
        if (res.status !== 200) {
            notifyError(res.data);
            return;
        }

        data = res.data;

        if (!data.tickets) {
            data.tickets = [];
        }

        if (!data.labels) {
            data.labels = {};
        }

        data.tickets = data.tickets.map((ticket) => {
            if (ticket.claimed_by === "null") {
                ticket.claimed_by = null;
            }

            return ticket;
        });

        filterTickets();
    }

    // Label management
    async function createLabel() {
        if (!newLabelName.trim()) return;

        const res = await axios.post(`${API_URL}/api/${guildId}/ticket-labels`, {
            name: newLabelName.trim(),
            colour: hexToInt(newLabelColour),
        });

        if (res.status !== 200) {
            notifyError(res.data);
            return;
        }

        labels = [...labels, res.data];
        newLabelName = "";
        newLabelColour = "#4A4A4A";
    }

    async function deleteLabel(labelId) {
        const res = await axios.delete(`${API_URL}/api/${guildId}/ticket-labels/${labelId}`);
        if (res.status !== 204) {
            notifyError(res.data);
            return;
        }

        labels = labels.filter(l => l.label_id !== labelId);
        selectedLabelIds = selectedLabelIds.filter(id => id !== labelId);
    }

    // Label assignment
    function toggleLabelDropdown(ticketId) {
        if (labelAssignDropdownTicketId === ticketId) {
            labelAssignDropdownTicketId = null;
        } else {
            labelAssignDropdownTicketId = ticketId;
        }
    }

    async function toggleLabelAssignment(ticketId, labelId) {
        const currentLabels = data.labels[ticketId] || [];
        const currentIds = currentLabels.map(l => l.label_id);
        let newIds;

        if (currentIds.includes(labelId)) {
            newIds = currentIds.filter(id => id !== labelId);
        } else {
            newIds = [...currentIds, labelId];
        }

        const res = await axios.put(`${API_URL}/api/${guildId}/tickets/${ticketId}/labels`, {
            label_ids: newIds,
        });

        if (res.status !== 200) {
            notifyError(res.data);
            return;
        }

        // Update local state
        const updatedLabels = newIds.map(id => {
            const label = labels.find(l => l.label_id === id);
            return label ? { label_id: label.label_id, name: label.name, colour: label.colour } : null;
        }).filter(Boolean);

        data.labels = { ...data.labels, [ticketId]: updatedLabels };
    }

    function handleLabelFilterChange(labelId) {
        if (selectedLabelIds.includes(labelId)) {
            selectedLabelIds = selectedLabelIds.filter(id => id !== labelId);
        } else {
            selectedLabelIds = [...selectedLabelIds, labelId];
        }
    }

    // Close label dropdown when clicking outside
    function handleDocumentClick(event) {
        if (labelAssignDropdownTicketId !== null) {
            const dropdown = event.target.closest('.label-assign-wrapper');
            if (!dropdown) {
                labelAssignDropdownTicketId = null;
            }
        }
    }

    const columnStorageKey = "ticket_list:selected_columns:v2";
    const sortOrderKey = "ticket_list:sort_order";
    const onlyMyTicketsKey = "ticket_list:only_my_tickets";

    $: (selectedColumns, updateFilters());
    $: (sortMethod, updateFilters());
    $: (onlyShowMyTickets, updateFilters());

    function updateFilters() {
        window.localStorage.setItem(
            columnStorageKey,
            JSON.stringify(selectedColumns),
        );
        window.localStorage.setItem(sortOrderKey, sortMethod);
        window.localStorage.setItem(
            onlyMyTicketsKey,
            JSON.stringify(onlyShowMyTickets),
        );

        filterTickets();
    }

    function loadFilterSettings() {
        const columns = window.localStorage.getItem(columnStorageKey);
        if (columns) {
            selectedColumns = JSON.parse(columns);
        }

        const sortOrder = window.localStorage.getItem(sortOrderKey);
        if (sortOrder) {
            sortMethod = sortOrder;
        }

        const onlyMyTickets = window.localStorage.getItem(onlyMyTicketsKey);
        if (onlyMyTickets) {
            onlyShowMyTickets = JSON.parse(onlyMyTickets);
        }
    }

    withLoadingScreen(async () => {
        loadFilterSettings();

        setDefaultHeaders();
        await Promise.all([loadPanels(), loadLabels(), loadTickets()]);
    });
</script>

<svelte:window on:click={handleDocumentClick} />

<main>
    <Card footer footerRight ref="filter-card">
        <span slot="title">
            <i class="fas fa-filter"></i>
            Filters
        </span>

        <div slot="body" class="body-wrapper-filter">
            <div class="form-wrapper">
                <div class="row">
                    <Dropdown
                        col2="true"
                        label="Sort Tickets By..."
                        bind:value={sortMethod}
                    >
                        <option value="id_asc"
                            >Ticket ID (Ascending) / Oldest First</option
                        >
                        <option value="id_desc"
                            >Ticket ID (Descending) / Newest First</option
                        >
                        <option value="unclaimed"
                            >Unclaimed & Awaiting Response First</option
                        >
                    </Dropdown>

                    <div class="col-2 checkbox-container">
                        <Checkbox
                            label="Only Show Unclaimed Tickets & Tickets Claimed By Me"
                            bind:value={onlyShowMyTickets}
                        />
                    </div>
                </div>

                <div class="divider"></div>

                <div class="row">
                    <Input
                        col4="true"
                        label="Ticket ID"
                        placeholder="Ticket ID"
                        on:input={handleInputTicketId}
                        bind:value={filterSettings.ticketId}
                    />

                    <Input
                        col4="true"
                        label="Username"
                        placeholder="Username"
                        on:input={handleInputUsername}
                        bind:value={filterSettings.username}
                    />

                    <Input
                        col4="true"
                        label="User ID"
                        placeholder="User ID"
                        on:input={handleInputUserId}
                        bind:value={filterSettings.userId}
                    />

                    <Input
                        col4="true"
                        label="Claimed By Id"
                        placeholder="Claimed By"
                        on:input={handleInputClaimedById}
                        bind:value={filterSettings.claimedById}
                    />
                </div>
                <div class="row">
                    <div class="col-4">
                        <PanelDropdown
                            label="Panel"
                            isMulti={false}
                            bind:panels
                            bind:selected={selectedPanel}
                        />
                    </div>
                </div>

                {#if labels.length > 0}
                    <div class="row" style="margin-top: 8px;">
                        <div class="col-12">
                            <label class="filter-label">Labels</label>
                            <div class="label-filter-pills">
                                {#each labels as label}
                                    <button
                                        class="label-pill"
                                        class:label-pill-active={selectedLabelIds.includes(label.label_id)}
                                        style="--label-bg: {intToHex(label.colour)}; --label-text: {textColourForBg(label.colour)};"
                                        on:click={() => handleLabelFilterChange(label.label_id)}
                                    >
                                        {label.name}
                                    </button>
                                {/each}
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
        <div slot="footer">
            <Button icon="fas fa-search" on:click={applyFilters}>Filter</Button>
        </div>
    </Card>

    <Card footer={false}>
        <span slot="title">
            Open Tickets
            {#if isAdmin}
                <button class="manage-labels-btn" on:click={() => showLabelManageModal = true} title="Manage Labels">
                    <i class="fas fa-tags"></i> Manage Labels
                </button>
            {/if}
        </span>
        <ColumnSelector
            options={[
                "ID",
                "Panel",
                "User",
                "Opened Time",
                "Claimed By",
                "Last Message Time",
                "Awaiting Response",
                "Labels",
            ]}
            bind:selected={selectedColumns}
            slot="title-items"
        />
        <div slot="body" class="body-wrapper">
            <table class="nice">
                <thead>
                    <tr>
                        <th class:visible={selectedColumns.includes("ID")}
                            >ID</th
                        >
                        <th class:visible={selectedColumns.includes("Panel")}
                            >Panel</th
                        >
                        <th class:visible={selectedColumns.includes("User")}
                            >User</th
                        >
                        <th
                            class:visible={selectedColumns.includes(
                                "Opened Time",
                            )}>Opened</th
                        >
                        <th
                            class:visible={selectedColumns.includes(
                                "Claimed By",
                            )}>Claimed By</th
                        >
                        <th
                            class:visible={selectedColumns.includes(
                                "Last Message Time",
                            )}>Last Message</th
                        >
                        <th
                            class:visible={selectedColumns.includes(
                                "Awaiting Response",
                            )}>Awaiting Response</th
                        >
                        <th
                            class:visible={selectedColumns.includes(
                                "Labels",
                            )}>Labels</th
                        >
                        <th class="visible"></th>
                    </tr>
                </thead>
                <tbody>
                    {#each filtered as ticket}
                        {@const user = data.resolved_users[ticket.user_id]}
                        {@const claimer = ticket.claimed_by
                            ? data.resolved_users[ticket.claimed_by]
                            : null}
                        {@const panel_title =
                            data.panel_titles[ticket.panel_id?.toString()]}
                        {@const ticketLabels = data.labels[ticket.id] || []}

                        <tr>
                            <td class:visible={selectedColumns.includes("ID")}
                                >{ticket.id}</td
                            >
                            <td
                                class:visible={selectedColumns.includes(
                                    "Panel",
                                )}
                            >
                                {panel_title || "Unknown Panel"}
                            </td>

                            <td
                                class:visible={selectedColumns.includes("User")}
                            >
                                {#if user}
                                    {user.global_name || user.username}
                                {:else}
                                    Unknown
                                {/if}
                            </td>

                            <td
                                class:visible={selectedColumns.includes(
                                    "Opened Time",
                                )}
                            >
                                {getRelativeTime(new Date(ticket.opened_at))}
                            </td>

                            <td
                                class:visible={selectedColumns.includes(
                                    "Claimed By",
                                )}
                            >
                                {#if ticket.claimed_by === null}
                                    <b>Unclaimed</b>
                                {:else if claimer}
                                    {claimer.global_name || claimer.username}
                                {:else}
                                    Unknown
                                {/if}
                            </td>

                            <td
                                class:visible={selectedColumns.includes(
                                    "Last Message Time",
                                )}
                            >
                                {#if ticket.last_response_time}
                                    {getRelativeTime(
                                        new Date(ticket.last_response_time),
                                    )}
                                {:else}
                                    Never
                                {/if}
                            </td>

                            <td
                                class:visible={selectedColumns.includes(
                                    "Awaiting Response",
                                )}
                            >
                                {#if ticket.last_response_is_staff}
                                    No
                                {:else}
                                    <b>Yes</b>
                                {/if}
                            </td>

                            <td
                                class:visible={selectedColumns.includes(
                                    "Labels",
                                )}
                                class="labels-cell"
                            >
                                <div class="labels-cell-inner">
                                    {#if ticketLabels.length > 0}
                                        {#each ticketLabels as label}
                                            <span
                                                class="label-badge"
                                                style="background-color: {intToHex(label.colour)}; color: {textColourForBg(label.colour)};"
                                            >{label.name}</span>
                                        {/each}
                                    {/if}
                                    {#if labels.length > 0}
                                        <div class="label-assign-wrapper">
                                            <button
                                                class="label-assign-btn"
                                                on:click|stopPropagation={() => toggleLabelDropdown(ticket.id)}
                                                title="Assign labels"
                                            >
                                                <i class="fas fa-plus" style="font-size: 10px;"></i>
                                            </button>
                                            {#if labelAssignDropdownTicketId === ticket.id}
                                                <div class="label-assign-dropdown" on:click|stopPropagation>
                                                    {#each labels as label}
                                                        <label class="label-assign-option">
                                                            <input
                                                                type="checkbox"
                                                                checked={ticketLabels.some(l => l.label_id === label.label_id)}
                                                                on:change={() => toggleLabelAssignment(ticket.id, label.label_id)}
                                                            />
                                                            <span
                                                                class="label-badge-sm"
                                                                style="background-color: {intToHex(label.colour)}; color: {textColourForBg(label.colour)};"
                                                            >{label.name}</span>
                                                        </label>
                                                    {/each}
                                                </div>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                            </td>

                            <td class="visible action-cell">
                                <div class="button-right">
                                    <Navigate
                                        to="/manage/{guildId}/tickets/view/{ticket.id}"
                                        styles="link"
                                    >
                                        <Button type="button">View</Button>
                                    </Navigate>
                                </div>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </Card>
</main>

<!-- Label Management Modal -->
{#if showLabelManageModal}
    <div class="modal-overlay" on:click={() => showLabelManageModal = false}>
        <div class="modal-content" on:click|stopPropagation>
            <div class="modal-header">
                <h3>Manage Labels</h3>
                <button class="modal-close" on:click={() => showLabelManageModal = false}>
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="label-list">
                    {#each labels as label}
                        <div class="label-list-item">
                            <span
                                class="label-badge"
                                style="background-color: {intToHex(label.colour)}; color: {textColourForBg(label.colour)};"
                            >{label.name}</span>
                            <button class="label-delete-btn" on:click={() => deleteLabel(label.label_id)} title="Delete label">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    {/each}
                    {#if labels.length === 0}
                        <p class="no-labels-text">No labels created yet.</p>
                    {/if}
                </div>

                <div class="label-create-form">
                    <h4>Create New Label</h4>
                    <div class="label-create-row">
                        <input
                            type="text"
                            class="label-name-input"
                            placeholder="Label name"
                            maxlength="32"
                            bind:value={newLabelName}
                            on:keydown={(e) => { if (e.key === 'Enter') createLabel(); }}
                        />
                        <input
                            type="color"
                            class="label-colour-input"
                            bind:value={newLabelColour}
                        />
                        <Button on:click={createLabel}>Create</Button>
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    main {
        display: flex;
        flex-direction: column;
        gap: 30px;
        width: 100%;
        height: 100%;
    }

    .body-wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
    }

    .body-wrapper-filter {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
    }

    .form-wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
    }

    .row {
        display: flex;
        flex-direction: row;
        justify-content: flex-start;
        gap: 2%;
        width: 100%;
        height: 100%;
    }

    th,
    td {
        display: none;
    }

    th.visible,
    td.visible {
        display: table-cell;
    }

    .action-cell {
        text-align: right;
        width: 120px;
    }

    .button-right {
        display: flex;
        justify-content: flex-end;
        width: 100%;
    }

    .checkbox-container {
        display: flex;
        align-self: flex-end;
        padding-bottom: 8px;
    }

    .divider {
        width: calc(100% + 48px);
        margin-left: -24px;
        margin-right: -24px;
        border-top: 1px solid var(--border-color);
        margin-top: 16px;
        margin-bottom: 16px;
    }

    :global([ref="filter-card"]) {
        min-height: 180px !important;
    }

    /* Label styles */
    .label-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
    }

    .label-badge-sm {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
    }

    .labels-cell {
        max-width: 200px;
    }

    .labels-cell-inner {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-items: center;
    }

    .label-assign-wrapper {
        position: relative;
        display: inline-flex;
    }

    .label-assign-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 1px dashed var(--border-color);
        background: transparent;
        color: var(--text-primary);
        cursor: pointer;
        opacity: 0.6;
        transition: opacity 0.15s;
    }

    .label-assign-btn:hover {
        opacity: 1;
        border-color: #995df3;
        color: #995df3;
    }

    .label-assign-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        z-index: 100;
        background: var(--background-secondary, #2b2d31);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 6px;
        min-width: 160px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .label-assign-option {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        cursor: pointer;
        border-radius: 4px;
    }

    .label-assign-option:hover {
        background: var(--background-hover, #36373d);
    }

    .label-assign-option input[type="checkbox"] {
        accent-color: #995df3;
    }

    /* Label filter pills */
    .filter-label {
        display: block;
        font-size: 14px;
        margin-bottom: 4px;
        color: var(--text-primary);
    }

    .label-filter-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .label-pill {
        padding: 3px 10px;
        border-radius: 14px;
        font-size: 12px;
        font-weight: 500;
        border: 2px solid transparent;
        cursor: pointer;
        background-color: var(--label-bg);
        color: var(--label-text);
        opacity: 0.5;
        transition: opacity 0.15s, border-color 0.15s;
    }

    .label-pill:hover {
        opacity: 0.8;
    }

    .label-pill-active {
        opacity: 1;
        border-color: #995df3;
    }

    .col-12 {
        width: 100%;
    }

    /* Manage Labels button */
    .manage-labels-btn {
        margin-left: 12px;
        padding: 4px 10px;
        font-size: 12px;
        background: var(--background-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-sm);
        color: #995df3;
        cursor: pointer;
        transition: all 0.15s;
    }

    .manage-labels-btn:hover {
        background: var(--background-hover);
        border-color: #995df3;
    }

    /* Modal styles */
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal-content {
        background: var(--background-secondary, #2b2d31);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        width: 90%;
        max-width: 480px;
        max-height: 80vh;
        overflow-y: auto;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-color);
    }

    .modal-header h3 {
        margin: 0;
        font-size: 18px;
    }

    .modal-close {
        background: none;
        border: none;
        color: var(--text-primary);
        cursor: pointer;
        font-size: 18px;
        opacity: 0.6;
    }

    .modal-close:hover {
        opacity: 1;
    }

    .modal-body {
        padding: 16px 20px;
    }

    .label-list {
        margin-bottom: 20px;
    }

    .label-list-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid var(--border-color);
    }

    .label-list-item:last-child {
        border-bottom: none;
    }

    .label-delete-btn {
        background: none;
        border: none;
        color: #e74c3c;
        cursor: pointer;
        opacity: 0.6;
        font-size: 14px;
    }

    .label-delete-btn:hover {
        opacity: 1;
    }

    .no-labels-text {
        color: var(--text-primary);
        opacity: 0.5;
        font-size: 14px;
    }

    .label-create-form h4 {
        margin: 0 0 10px 0;
        font-size: 15px;
    }

    .label-create-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .label-name-input {
        flex: 1;
        height: 36px;
        padding: 6px 10px;
        background: var(--background-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-sm);
        color: var(--text-primary);
        font-size: 14px;
    }

    .label-name-input:focus {
        outline: none;
        border-color: #995df3;
    }

    .label-colour-input {
        width: 36px;
        height: 36px;
        padding: 2px;
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-sm);
        background: var(--background-tertiary);
        cursor: pointer;
    }

    @media only screen and (max-width: 950px) {
        .row {
            flex-direction: column;
        }

        .checkbox-container {
            padding-bottom: 0;
            align-self: flex-start;
        }

        :global([ref="filter-card"]) {
            min-height: 380px !important;
        }
    }
</style>
