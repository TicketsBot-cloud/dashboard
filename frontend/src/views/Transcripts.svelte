<script>
    import Card from "../components/Card.svelte";
    import Input from "../components/form/Input.svelte";
    import Button from "../components/Button.svelte";
    import { notifyError, withLoadingScreen } from "../js/util";
    import { onMount } from "svelte";
    import { dropdown } from "../js/stores";
    import axios from "axios";
    import { API_URL } from "../js/constants";
    import { setDefaultHeaders } from "../includes/Auth.svelte";
    import { Navigate } from "svelte-router-spa";
    import PanelDropdown from "../components/PanelDropdown.svelte";
    import Dropdown from "../components/form/Dropdown.svelte";
    import ColumnSelector from "../components/ColumnSelector.svelte";
    import ConfirmationModal from "../components/ConfirmationModal.svelte";
    import ActionDropdown from "../components/ActionDropdown.svelte";
    import Textarea from "../components/form/Textarea.svelte";

    setDefaultHeaders();

    export let currentRoute;
    let guildId = currentRoute.namedParams.id;

    let filterSettings = {};
    let transcripts = [];

    let panels = [];
    let selectedPanel;

    const pageLimit = 15;
    let page = 1;
    let jumpToPage = page;          // Bound to page input field
    let totalPages = 1;             // Total number of pages from API
    let totalCount = 0;             // Total number of transcripts

    let editingTranscript = null;
    let editReason = "";

    // Show Columns logic
    let selectedColumns = [
        "Ticket ID",
        "Username",
        "Rating",
        "Close Reason",
        "Actions",
    ];
    const columnStorageKey = "transcript_list:selected_columns:new";

    $: (selectedColumns, updateColumnStorage());

    $: isAtEnd = page >= totalPages;

    $: if (page) {
        jumpToPage = page;
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
        // Undefined fields won't be included in the JSON
        return {
            id: filterSettings.ticketId,
            username: filterSettings.username,
            user_id: filterSettings.userId,
            closed_by_id: filterSettings.closedById,
            claimed_by_id: filterSettings.claimedById,
            rating: filterSettings.rating,
            panel_id: selectedPanel,
            page: page,
        };
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

    withLoadingScreen(async () => {
        loadColumnSettings();
        await Promise.all([loadPanels(), loadData({})]);
    });

    async function saveCloseReason() {
        const res = await axios.patch(
            `${API_URL}/api/${guildId}/tickets/${editingTranscript.ticket_id}/close-reason`,
            { reason: editReason }
        );
        if (res.status !== 200) {
            notifyError(res.data);
            return;
        }
        editingTranscript.close_reason = editReason;
        transcripts = transcripts;
        editingTranscript = null;
    }
</script>

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
                </div>
            </div>
            <div slot="footer">
                <Button icon="fas fa-search" on:click={filter}>Filter</Button>
            </div>
        </Card>

        <div style="margin: 2% 0;">
            <Card footer={false}>
                <span slot="title"> Transcripts </span>
                <ColumnSelector
                    options={[
                        "Ticket ID",
                        "Username",
                        "Rating",
                        "Close Reason",
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
                                            "Actions",
                                        )}
                                        class="transcript-cell"
                                    >
                                        <ActionDropdown bind:this={transcript.dropdownRef}>
                                            {#if transcript.has_transcript}
                                                <Navigate
                                                    to={`/manage/${guildId}/transcripts/view/${transcript.ticket_id}`}
                                                    styles="link"
                                                >
                                                    <button on:click={() => transcript.dropdownRef?.close()}>
                                                        <i class="fas fa-eye"></i>
                                                        <span>View</span>
                                                    </button>
                                                </Navigate>
                                            {/if}
                                            <button on:click={() => {
                                                editingTranscript = transcript;
                                                editReason = transcript.close_reason || "";
                                                transcript.dropdownRef?.close();
                                            }}>
                                                <i class="fas fa-pencil"></i>
                                                <span>Edit Reason</span>
                                            </button>
                                        </ActionDropdown>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>

                    {#if editingTranscript}
                        <ConfirmationModal icon="fas fa-save"
                            on:cancel={() => editingTranscript = null}
                            on:confirm={saveCloseReason}
                        >
                            <span slot="title">Edit Close Reason</span>
                            <div slot="body" style="width: 100%">
                                <Textarea placeholder="No reason specified" bind:value={editReason} />
                            </div>
                            <span slot="confirm">Save</span>
                        </ConfirmationModal>
                    {/if}

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
        width: 60px;
        text-align: center;
    }

    :global(table.nice > tbody > tr > td:last-child) {
        width: 60px;
        text-align: center;
    }

    .transcript-cell {
        text-align: center !important;
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
