<script>
    import Card from "../components/Card.svelte";
    import Input from "../components/form/Input.svelte";
    import Button from "../components/Button.svelte";
    import { notifyError, withLoadingScreen } from "../js/util";
    import { onMount } from "svelte";
    import { dropdown, permissionLevelCache } from "../js/stores";
    import axios from "axios";
    import { API_URL } from "../js/constants";
    import { setDefaultHeaders } from "../includes/Auth.svelte";
    import { Navigate } from "svelte-router-spa";
    import PanelDropdown from "../components/PanelDropdown.svelte";
    import Dropdown from "../components/form/Dropdown.svelte";
    import ColumnSelector from "../components/ColumnSelector.svelte";
    setDefaultHeaders();

    export let currentRoute;
    let guildId = currentRoute.namedParams.id;

    let filterSettings = {};
    let transcripts = [];

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

    const pageLimit = 15;
    let page = 1;
    let jumpToPage = page;          // Bound to page input field
    let totalPages = 1;             // Total number of pages from API
    let totalCount = 0;             // Total number of transcripts

    // Show Columns logic
    let selectedColumns = [
        "Ticket ID",
        "Username",
        "Rating",
        "Close Reason",
        "Labels",
        "Actions",
    ];
    const columnStorageKey = "transcript_list:selected_columns:v2";

    $: (selectedColumns, updateColumnStorage());

    $: isAtEnd = page >= totalPages;

    $: if (page) {
        jumpToPage = page;
    }

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

    function updateColumnStorage() {
        window.localStorage.setItem(
            columnStorageKey,
            JSON.stringify(selectedColumns),
        );
    }

    function loadColumnSettings() {
        const columns = window.localStorage.getItem(columnStorageKey);
        if (columns) {
            selectedColumns = JSON.parse(columns);
        }
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

    let handleInputClosedById = () => {
        if (filterSettings.closedById == "") {
            filterSettings.closedById = undefined;
        }
    };

    let handleInputClaimedById = () => {
        if (filterSettings.claimedById == "") {
            filterSettings.claimedById = undefined;
        }
    };

    let loading = false;

    async function loadPrevious() {
        if (loading) return;

        if (page === 1) {
            return;
        }

        let paginationSettings = buildPaginationSettings(page - 1);

        loading = true;
        if (await loadData(paginationSettings)) {
            page--;
            jumpToPage = page;
        }
        loading = false;
    }

    async function loadNext() {
        if (loading) return;

        if (isAtEnd) {
            return;
        }

        let paginationSettings = buildPaginationSettings(page + 1);

        loading = true;
        if (await loadData(paginationSettings)) {
            page++;
            jumpToPage = page;
        }
        loading = false;
    }

    async function loadFirst() {
        if (loading || page === 1) return;

        let paginationSettings = buildPaginationSettings(1);
        loading = true;
        if (await loadData(paginationSettings)) {
            page = 1;
            jumpToPage = 1;
        }
        loading = false;
    }

    async function loadPrevious2() {
        if (loading || page <= 2) return;

        const targetPage = Math.max(1, page - 2);
        let paginationSettings = buildPaginationSettings(targetPage);

        loading = true;
        if (await loadData(paginationSettings)) {
            page = targetPage;
            jumpToPage = targetPage;
        }
        loading = false;
    }

    async function loadNext2() {
        if (loading) return;

        if (page + 2 > totalPages) return;

        const targetPage = page + 2;
        let paginationSettings = buildPaginationSettings(targetPage);

        loading = true;
        if (await loadData(paginationSettings)) {
            page = targetPage;
            jumpToPage = targetPage;
        }
        loading = false;
    }

    async function loadLast() {
        if (loading || page === totalPages) return;

        let paginationSettings = buildPaginationSettings(totalPages);

        loading = true;
        if (await loadData(paginationSettings)) {
            page = totalPages;
            jumpToPage = totalPages;
        }
        loading = false;
    }

    async function jumpToSpecificPage() {
        if (loading) return;

        let targetPage = parseInt(jumpToPage);
        if (isNaN(targetPage) || targetPage < 1) {
            jumpToPage = page; // Reset to current page
            return;
        }

        // If target page is higher than total pages, go to last page instead
        if (targetPage > totalPages) {
            targetPage = totalPages;
        }

        // Don't reload current page
        if (targetPage === page) {
            jumpToPage = page;
            return;
        }

        let paginationSettings = buildPaginationSettings(targetPage);

        loading = true;
        const success = await loadData(paginationSettings);

        if (success) {
            page = targetPage;
        } else {
            jumpToPage = page;
        }

        loading = false;
    }

    function handlePageInputKeydown(event) {
        if (event.key === 'Enter') {
            jumpToSpecificPage();
        }
    }

    function buildPaginationSettings(page) {
        let settings = {
            id: filterSettings.ticketId,
            username: filterSettings.username,
            user_id: filterSettings.userId,
            closed_by_id: filterSettings.closedById,
            claimed_by_id: filterSettings.claimedById,
            rating: filterSettings.rating,
            panel_id: selectedPanel,
            page: page,
        };

        if (selectedLabelIds.length > 0) {
            settings.label_ids = selectedLabelIds;
        }

        return settings;
    }

    async function filter() {
        let opts = buildPaginationSettings(1);
        await loadData(opts);
        page = 1;
        jumpToPage = 1;
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

    async function loadData(paginationSettings) {
        const res = await axios.post(
            `${API_URL}/api/${guildId}/transcripts`,
            paginationSettings,
        );
        if (res.status !== 200) {
            notifyError(res.data);
            return false;
        }

        transcripts = res.data.transcripts;
        totalCount = res.data.total_count;
        totalPages = res.data.total_pages;
        return true;
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
        // Remove from filter selection
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
        const transcript = transcripts.find(t => t.ticket_id === ticketId);
        if (!transcript) return;

        const currentIds = (transcript.labels || []).map(l => l.label_id);
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

        transcripts = transcripts.map(t => {
            if (t.ticket_id === ticketId) {
                return { ...t, labels: updatedLabels };
            }
            return t;
        });
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

    withLoadingScreen(async () => {
        loadColumnSettings();
        await Promise.all([loadPanels(), loadLabels(), loadData({})]);
    });
</script>

<svelte:window on:click={handleDocumentClick} />

<div class="content">
    <div class="col">
        <Card footer footerRight ref="filter-card">
            <span slot="title">
                <i class="fas fa-filter"></i>
                Filter Logs
            </span>

            <div slot="body" class="body-wrapper">
                <div class="form-wrapper">
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
                            label="Closed By Id"
                            placeholder="Closed By"
                            on:input={handleInputClosedById}
                            bind:value={filterSettings.closedById}
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

                        <Dropdown
                            col4="true"
                            label="Rating"
                            bind:value={filterSettings.rating}
                        >
                            <option value="0">Any</option>
                            <option value="1">1 ⭐</option>
                            <option value="2">2 ⭐</option>
                            <option value="3">3 ⭐</option>
                            <option value="4">4 ⭐</option>
                            <option value="5">5 ⭐</option>
                        </Dropdown>

                        <Input
                            col4="true"
                            label="Claimed By Id"
                            placeholder="Claimed By"
                            on:input={handleInputClaimedById}
                            bind:value={filterSettings.claimedById}
                        />
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
                <Button icon="fas fa-search" on:click={filter}>Filter</Button>
            </div>
        </Card>

        <div style="margin: 2% 0;">
            <Card footer={false}>
                <span slot="title">
                    Transcripts
                    {#if isAdmin}
                        <button class="manage-labels-btn" on:click={() => showLabelManageModal = true} title="Manage Labels">
                            <i class="fas fa-tags"></i> Manage Labels
                        </button>
                    {/if}
                </span>
                <ColumnSelector
                    options={[
                        "Ticket ID",
                        "Username",
                        "Rating",
                        "Close Reason",
                        "Labels",
                        "Actions",
                    ]}
                    bind:selected={selectedColumns}
                    slot="title-items"
                />

                <div slot="body" class="main-col">
                    <table class="nice">
                        <thead>
                            <tr>
                                <th
                                    class:visible={selectedColumns.includes(
                                        "Ticket ID",
                                    )}>Ticket ID</th
                                >
                                <th
                                    class:visible={selectedColumns.includes(
                                        "Username",
                                    )}>Username</th
                                >
                                <th
                                    class:visible={selectedColumns.includes(
                                        "Rating",
                                    )}>Rating</th
                                >
                                <th
                                    class:visible={selectedColumns.includes(
                                        "Close Reason",
                                    )}>Close Reason</th
                                >
                                <th
                                    class:visible={selectedColumns.includes(
                                        "Labels",
                                    )}>Labels</th
                                >
                                <th
                                    class:visible={selectedColumns.includes(
                                        "Actions",
                                    )}
                                ></th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each transcripts as transcript}
                                <tr style="height: 70px;">
                                    <td
                                        class:visible={selectedColumns.includes(
                                            "Ticket ID",
                                        )}>{transcript.ticket_id}</td
                                    >
                                    <td
                                        class:visible={selectedColumns.includes(
                                            "Username",
                                        )}>{transcript.username}</td
                                    >
                                    <td
                                        class:visible={selectedColumns.includes(
                                            "Rating",
                                        )}
                                    >
                                        {#if transcript.rating}
                                            {transcript.rating} ⭐
                                        {:else}
                                            No rating
                                        {/if}
                                    </td>
                                    <td
                                        class:visible={selectedColumns.includes(
                                            "Close Reason",
                                        )}
                                    >
                                        {transcript.close_reason ||
                                            "No reason specified"}
                                    </td>
                                    <td
                                        class:visible={selectedColumns.includes(
                                            "Labels",
                                        )}
                                        class="labels-cell"
                                    >
                                        <div class="labels-cell-inner">
                                            {#if transcript.labels && transcript.labels.length > 0}
                                                {#each transcript.labels as label}
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
                                                        on:click|stopPropagation={() => toggleLabelDropdown(transcript.ticket_id)}
                                                        title="Assign labels"
                                                    >
                                                        <i class="fas fa-plus" style="font-size: 10px;"></i>
                                                    </button>
                                                    {#if labelAssignDropdownTicketId === transcript.ticket_id}
                                                        <div class="label-assign-dropdown" on:click|stopPropagation>
                                                            {#each labels as label}
                                                                <label class="label-assign-option">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={(transcript.labels || []).some(l => l.label_id === label.label_id)}
                                                                        on:change={() => toggleLabelAssignment(transcript.ticket_id, label.label_id)}
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
                                    <td
                                        class:visible={selectedColumns.includes(
                                            "Actions",
                                        )}
                                        class="transcript-cell"
                                    >
                                        {#if transcript.has_transcript}
                                            <div class="button-container">
                                                <Navigate
                                                    to={`/manage/${guildId}/transcripts/view/${transcript.ticket_id}`}
                                                    styles="link"
                                                >
                                                    <Button>View</Button>
                                                </Navigate>
                                            </div>
                                        {/if}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>

                    <div
                        class="pagination-controls"
                        class:pagination-controls-margin={transcripts.length === 0}
                    >
                        <!-- First page -->
                        <button
                            class="pagination-btn"
                            class:disabled={page === 1 || loading}
                            on:click={loadFirst}
                            disabled={page === 1 || loading}
                            title="Go to first page"
                        >
                            <i class="fas fa-angles-left"></i>
                        </button>

                        <!-- Previous 2 pages -->
                        <button
                            class="pagination-btn"
                            class:disabled={page <= 2 || loading}
                            on:click={loadPrevious2}
                            disabled={page <= 2 || loading}
                            title="Go back 2 pages"
                        >
                            <i class="fas fa-backward"></i>
                        </button>

                        <!-- Previous page -->
                        <button
                            class="pagination-btn"
                            class:disabled={page === 1 || loading}
                            on:click={loadPrevious}
                            disabled={page === 1 || loading}
                            title="Previous page"
                        >
                            <i class="fas fa-chevron-left"></i>
                        </button>

                        <!-- Page input -->
                        <div class="page-input-wrapper">
                            <input
                                id="page-jump"
                                type="number"
                                class="page-input"
                                min="1"
                                max={totalPages}
                                bind:value={jumpToPage}
                                on:keydown={handlePageInputKeydown}
                                on:blur={jumpToSpecificPage}
                                disabled={loading}
                                placeholder={`1-${totalPages}`}
                            />
                        </div>

                        <!-- Next page -->
                        <button
                            class="pagination-btn"
                            class:disabled={isAtEnd || loading}
                            on:click={loadNext}
                            disabled={isAtEnd || loading}
                            title="Next page"
                        >
                            <i class="fas fa-chevron-right"></i>
                        </button>

                        <!-- Next 2 pages -->
                        <button
                            class="pagination-btn"
                            class:disabled={page + 2 > totalPages || loading}
                            on:click={loadNext2}
                            disabled={page + 2 > totalPages || loading}
                            title="Go forward 2 pages"
                        >
                            <i class="fas fa-forward"></i>
                        </button>

                        <!-- Last page -->
                        <button
                            class="pagination-btn"
                            class:disabled={page === totalPages || loading}
                            on:click={loadLast}
                            disabled={page === totalPages || loading}
                            title="Go to last page"
                        >
                            <i class="fas fa-angles-right"></i>
                        </button>
                    </div>
                </div>
            </Card>
        </div>
    </div>
</div>

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
    .content {
        display: flex;
        justify-content: center;
        height: 100%;
        width: 100%;
    }

    .col {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
    }

    .main-col {
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

    .form-wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
    }

    table.nice > tbody > tr > td {
        padding: 10px;
    }

    :global(table.nice > thead > tr > th:last-child) {
        width: 120px;
        text-align: right;
    }

    :global(table.nice > tbody > tr > td:last-child) {
        width: 120px;
        text-align: right;
    }

    .transcript-cell {
        text-align: right !important;
        padding-right: 10px !important;
    }

    .button-container {
        display: flex;
        justify-content: flex-end;
        width: 100%;
    }

    :global([ref="filter-card"]) {
        min-height: 110px !important;
    }

    :global(table.nice) {
        width: 100%;
        border-collapse: collapse;
    }

    :global(table.nice > thead > tr > th) {
        text-align: left;
        font-weight: normal;
        border-bottom: 1px solid #dee2e6;
        padding-left: 10px;
        padding-right: 10px;
    }

    :global(table.nice > thead > tr, table.nice > tbody > tr) {
        border-bottom: 1px solid #dee2e6;
    }

    :global(table.nice > tbody > tr:last-child) {
        border-bottom: none;
    }

    :global(table.nice > tbody > tr > td) {
        padding: 10px 0 10px 10px;
    }

    .pagination-controls {
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        gap: 8px;
        padding: 16px 0;
    }

    .pagination-controls-margin {
        margin-top: 15px;
    }

    .pagination-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: var(--background-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-sm);
        color: #995df3;
        cursor: pointer;
        transition: all var(--transition-fast);
    }

    .pagination-btn:hover:not(.disabled) {
        background: var(--background-hover);
        border-color: var(--border-color-hover);
        transform: translateY(-1px);
    }

    .pagination-btn:active:not(.disabled) {
        transform: translateY(0);
    }

    .pagination-btn.disabled {
        color: #6c757d;
        cursor: not-allowed;
        opacity: 0.5;
    }

    .pagination-btn i {
        font-size: 14px;
    }

    .page-input-wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .page-input {
        width: 60px;
        height: 36px;
        padding: 6px 10px;
        background: var(--background-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-sm);
        color: var(--text-primary);
        font-size: 14px;
        text-align: center;
        transition: all var(--transition-fast);
    }

    .page-input:hover:not(:disabled) {
        border-color: var(--border-color-hover);
    }

    .page-input:focus {
        outline: none;
        border-color: #995df3;
        box-shadow: 0 0 0 2px rgba(153, 93, 243, 0.2);
    }

    .page-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Remove spinner from number input */
    .page-input::-webkit-inner-spin-button,
    .page-input::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    .page-input[type=number] {
        appearance: textfield;
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

    .col-12 {
        width: 100%;
    }

    @media only screen and (max-width: 950px) {
        .row {
            flex-direction: column;
        }

        :global([ref="filter-card"]) {
            min-height: 252px !important;
        }
    }

    @media only screen and (max-width: 576px) {
        .col {
            width: 100%;
        }

        .pagination-controls {
            gap: 4px;
            flex-wrap: wrap;
        }

        .pagination-btn {
            width: 32px;
            height: 32px;
        }

        .page-input {
            width: 50px;
            height: 32px;
            font-size: 13px;
        }
    }

    th,
    td {
        display: none;
    }
    th.visible,
    td.visible {
        display: table-cell;
    }
</style>
