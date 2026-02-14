<script>
    import Card from "../components/Card.svelte";
    import Input from "../components/form/Input.svelte";
    import Button from "../components/Button.svelte";
    import Dropdown from "../components/form/Dropdown.svelte";
    import AuditLogDiff from "../components/AuditLogDiff.svelte";
    import { notifyError, withLoadingScreen } from "../js/util";
    import axios from "axios";
    import { API_URL } from "../js/constants";
    import { setDefaultHeaders } from "../includes/Auth.svelte";
    import {
        ACTION_TYPE_LABELS,
        RESOURCE_TYPE_LABELS,
        formatActionType,
        formatResourceType,
    } from "../js/auditlog";

    setDefaultHeaders();

    export let currentRoute;
    let guildId = currentRoute.namedParams.id;

    let filterUserId = "";
    let filterActionType = "0";
    let filterResourceType = "0";
    let filterDateFrom = "";
    let filterDateTo = "";

    let entries = [];
    let expandedRow = null;

    const pageLimit = 25;
    let page = 1;
    let jumpToPage = page;
    let totalPages = 1;
    let totalCount = 0;

    $: isAtEnd = page >= totalPages;

    $: if (page) {
        jumpToPage = page;
    }

    let loading = false;

    function buildRequestBody(targetPage) {
        let body = { page: targetPage };

        if (filterUserId && filterUserId.trim() !== "") {
            body.user_id = filterUserId.trim();
        }
        if (filterActionType !== "0") {
            body.action_type = parseInt(filterActionType);
        }
        if (filterResourceType !== "0") {
            body.resource_type = parseInt(filterResourceType);
        }
        if (filterDateFrom) {
            body.after = new Date(filterDateFrom).toISOString();
        }
        if (filterDateTo) {
            body.before = new Date(filterDateTo).toISOString();
        }

        return body;
    }

    async function loadData(requestBody) {
        const res = await axios.post(
            `${API_URL}/api/${guildId}/audit-logs`,
            requestBody,
        );
        if (res.status !== 200) {
            notifyError(res.data);
            return false;
        }

        entries = res.data.entries || [];
        totalCount = res.data.total_count;
        totalPages = res.data.total_pages;
        return true;
    }

    async function filter() {
        expandedRow = null;
        let body = buildRequestBody(1);
        await loadData(body);
        page = 1;
        jumpToPage = 1;
    }

    function toggleRow(id) {
        expandedRow = expandedRow === id ? null : id;
    }

    function formatTimestamp(ts) {
        const d = new Date(ts);
        return d.toLocaleString();
    }

    // Pagination
    async function loadFirst() {
        if (loading || page === 1) return;
        loading = true;
        if (await loadData(buildRequestBody(1))) {
            page = 1;
            jumpToPage = 1;
            expandedRow = null;
        }
        loading = false;
    }

    async function loadPrevious2() {
        if (loading || page <= 2) return;
        const target = Math.max(1, page - 2);
        loading = true;
        if (await loadData(buildRequestBody(target))) {
            page = target;
            jumpToPage = target;
            expandedRow = null;
        }
        loading = false;
    }

    async function loadPrevious() {
        if (loading || page === 1) return;
        loading = true;
        if (await loadData(buildRequestBody(page - 1))) {
            page--;
            jumpToPage = page;
            expandedRow = null;
        }
        loading = false;
    }

    async function loadNext() {
        if (loading || isAtEnd) return;
        loading = true;
        if (await loadData(buildRequestBody(page + 1))) {
            page++;
            jumpToPage = page;
            expandedRow = null;
        }
        loading = false;
    }

    async function loadNext2() {
        if (loading || page + 2 > totalPages) return;
        const target = page + 2;
        loading = true;
        if (await loadData(buildRequestBody(target))) {
            page = target;
            jumpToPage = target;
            expandedRow = null;
        }
        loading = false;
    }

    async function loadLast() {
        if (loading || page === totalPages) return;
        loading = true;
        if (await loadData(buildRequestBody(totalPages))) {
            page = totalPages;
            jumpToPage = totalPages;
            expandedRow = null;
        }
        loading = false;
    }

    async function jumpToSpecificPage() {
        if (loading) return;
        let target = parseInt(jumpToPage);
        if (isNaN(target) || target < 1) {
            jumpToPage = page;
            return;
        }
        if (target > totalPages) target = totalPages;
        if (target === page) {
            jumpToPage = page;
            return;
        }
        loading = true;
        const success = await loadData(buildRequestBody(target));
        if (success) {
            page = target;
            expandedRow = null;
        } else {
            jumpToPage = page;
        }
        loading = false;
    }

    function handlePageInputKeydown(event) {
        if (event.key === "Enter") {
            jumpToSpecificPage();
        }
    }

    withLoadingScreen(async () => {
        await loadData({ page: 1 });
    });
</script>

<div class="content">
    <div class="col">
        <Card footer footerRight ref="filter-card">
            <span slot="title">
                <i class="fas fa-filter"></i>
                Filter Audit Logs
            </span>

            <div slot="body" class="body-wrapper">
                <div class="form-wrapper">
                    <div class="row">
                        <Input
                            col4="true"
                            label="User ID"
                            placeholder="User ID"
                            bind:value={filterUserId}
                        />

                        <Dropdown
                            col4="true"
                            label="Action Type"
                            bind:value={filterActionType}
                        >
                            <option value="0">All Actions</option>
                            {#each Object.entries(ACTION_TYPE_LABELS) as [value, label]}
                                <option {value}>{label}</option>
                            {/each}
                        </Dropdown>

                        <Dropdown
                            col4="true"
                            label="Resource Type"
                            bind:value={filterResourceType}
                        >
                            <option value="0">All Resources</option>
                            {#each Object.entries(RESOURCE_TYPE_LABELS) as [value, label]}
                                <option {value}>{label}</option>
                            {/each}
                        </Dropdown>
                    </div>
                    <div class="row" style="margin-top: 8px;">
                        <Input
                            col4="true"
                            label="Date From"
                            placeholder="YYYY-MM-DD"
                            bind:value={filterDateFrom}
                        />

                        <Input
                            col4="true"
                            label="Date To"
                            placeholder="YYYY-MM-DD"
                            bind:value={filterDateTo}
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
                <span slot="title">
                    <i class="fas fa-history"></i>
                    Audit Logs ({totalCount} entries)
                </span>

                <div slot="body" class="main-col">
                    <!-- Desktop Table View -->
                    <table class="nice">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>User</th>
                                <th>Action</th>
                                <th>Resource</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each entries as entry}
                                <tr
                                    class="entry-row"
                                    on:click={() => toggleRow(entry.id)}
                                >
                                    <td>{formatTimestamp(entry.created_at)}</td>
                                    <td class="username">{entry.username}</td>
                                    <td>
                                        <span class="action-badge">
                                            {formatActionType(
                                                entry.action_type,
                                            )}
                                        </span>
                                    </td>
                                    <td
                                        >{formatResourceType(
                                            entry.resource_type,
                                        )}</td
                                    >
                                    <td class="expand-cell">
                                        <i
                                            class="fas"
                                            class:fa-chevron-down={expandedRow !==
                                                entry.id}
                                            class:fa-chevron-up={expandedRow ===
                                                entry.id}
                                        ></i>
                                    </td>
                                </tr>
                                {#if expandedRow === entry.id}
                                    <tr class="detail-row">
                                        <td colspan="5">
                                            <div class="detail-content">
                                                <AuditLogDiff
                                                    oldData={entry.old_data}
                                                    newData={entry.new_data}
                                                />
                                                {#if entry.metadata}
                                                    <div
                                                        class="metadata-section"
                                                    >
                                                        <span
                                                            class="metadata-label"
                                                            >Metadata:</span
                                                        >
                                                        <pre
                                                            class="metadata-value">{JSON.stringify(
                                                                JSON.parse(
                                                                    entry.metadata,
                                                                ),
                                                                null,
                                                                2,
                                                            )}</pre>
                                                    </div>
                                                {/if}
                                            </div>
                                        </td>
                                    </tr>
                                {/if}
                            {/each}
                        </tbody>
                    </table>

                    <!-- Mobile Card View -->
                    <div class="mobile-card-list">
                        {#each entries as entry}
                            <div
                                class="mobile-entry-card"
                                on:click={() => toggleRow(entry.id)}
                            >
                                <div class="mobile-card-header">
                                    <div class="mobile-card-user">
                                        {entry.username}
                                    </div>
                                    <div class="mobile-card-time">
                                        {formatTimestamp(entry.created_at)}
                                    </div>
                                </div>
                                <div class="mobile-card-details">
                                    <div class="mobile-card-row">
                                        <span class="mobile-card-label"
                                            >Action:</span
                                        >
                                        <span class="action-badge">
                                            {formatActionType(
                                                entry.action_type,
                                            )}
                                        </span>
                                    </div>
                                    <div class="mobile-card-row">
                                        <span class="mobile-card-label"
                                            >Resource:</span
                                        >
                                        <span
                                            >{formatResourceType(
                                                entry.resource_type,
                                            )}</span
                                        >
                                    </div>
                                </div>
                                <div class="mobile-expand-icon">
                                    <i
                                        class="fas"
                                        class:fa-chevron-down={expandedRow !==
                                            entry.id}
                                        class:fa-chevron-up={expandedRow ===
                                            entry.id}
                                    ></i>
                                </div>
                                {#if expandedRow === entry.id}
                                    <div
                                        class="detail-content"
                                        style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color, #dee2e6);"
                                    >
                                        <AuditLogDiff
                                            oldData={entry.old_data}
                                            newData={entry.new_data}
                                        />
                                        {#if entry.metadata}
                                            <div class="metadata-section">
                                                <span class="metadata-label"
                                                    >Metadata:</span
                                                >
                                                <pre class="metadata-value">{JSON.stringify(
                                                        JSON.parse(
                                                            entry.metadata,
                                                        ),
                                                        null,
                                                        2,
                                                    )}</pre>
                                            </div>
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>

                    {#if entries.length === 0}
                        <div class="empty-state">
                            No audit log entries found.
                        </div>
                    {/if}

                    <div
                        class="pagination-controls"
                        class:pagination-controls-margin={entries.length === 0}
                    >
                        <button
                            class="pagination-btn"
                            class:disabled={page === 1 || loading}
                            on:click={loadFirst}
                            disabled={page === 1 || loading}
                            title="Go to first page"
                        >
                            <i class="fas fa-angles-left"></i>
                        </button>

                        <button
                            class="pagination-btn"
                            class:disabled={page <= 2 || loading}
                            on:click={loadPrevious2}
                            disabled={page <= 2 || loading}
                            title="Go back 2 pages"
                        >
                            <i class="fas fa-backward"></i>
                        </button>

                        <button
                            class="pagination-btn"
                            class:disabled={page === 1 || loading}
                            on:click={loadPrevious}
                            disabled={page === 1 || loading}
                            title="Previous page"
                        >
                            <i class="fas fa-chevron-left"></i>
                        </button>

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

                        <button
                            class="pagination-btn"
                            class:disabled={isAtEnd || loading}
                            on:click={loadNext}
                            disabled={isAtEnd || loading}
                            title="Next page"
                        >
                            <i class="fas fa-chevron-right"></i>
                        </button>

                        <button
                            class="pagination-btn"
                            class:disabled={page + 2 > totalPages || loading}
                            on:click={loadNext2}
                            disabled={page + 2 > totalPages || loading}
                            title="Go forward 2 pages"
                        >
                            <i class="fas fa-forward"></i>
                        </button>

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

    table.nice {
        width: 100%;
        border-collapse: collapse;
    }

    /* Hide mobile cards on desktop */
    .mobile-card-list {
        display: none;
    }

    table.nice > thead > tr > th {
        text-align: left;
        font-weight: normal;
        border-bottom: 1px solid #dee2e6;
        padding: 10px;
    }

    table.nice > thead > tr,
    table.nice > tbody > tr.entry-row {
        border-bottom: 1px solid #dee2e6;
    }

    table.nice > tbody > tr:last-child {
        border-bottom: none;
    }

    table.nice > tbody > tr > td {
        padding: 10px;
    }

    .entry-row {
        cursor: pointer;
        transition: background var(--transition-fast);
    }

    .entry-row:hover {
        background: var(--background-hover, rgba(153, 93, 243, 0.05));
    }

    .username {
        font-weight: 500;
    }

    .action-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        background: rgba(153, 93, 243, 0.15);
        color: #995df3;
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
    }

    .expand-cell {
        width: 40px;
        text-align: center;
        color: #6c757d;
    }

    .detail-row {
        background: var(--background-tertiary, rgba(0, 0, 0, 0.05));
    }

    .detail-row td {
        padding: 16px !important;
    }

    .detail-content {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .metadata-section {
        border-top: 1px solid var(--border-color, #dee2e6);
        padding-top: 8px;
    }

    .metadata-label {
        font-weight: 600;
        font-size: 13px;
        color: var(--text-secondary, #6c757d);
    }

    .metadata-value {
        font-family: monospace;
        font-size: 12px;
        margin: 4px 0 0 0;
        padding: 8px;
        background: var(--background-secondary, rgba(0, 0, 0, 0.03));
        border-radius: 4px;
        overflow-x: auto;
    }

    .empty-state {
        text-align: center;
        padding: 32px;
        color: var(--text-secondary, #6c757d);
        font-style: italic;
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

    .page-input::-webkit-inner-spin-button,
    .page-input::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    .page-input[type="number"] {
        appearance: textfield;
    }

    :global([ref="filter-card"]) {
        min-height: 110px !important;
    }

    @media only screen and (max-width: 950px) {
        .row {
            flex-direction: column;
        }

        :global([ref="filter-card"]) {
            min-height: 252px !important;
        }
    }

    @media only screen and (max-width: 768px) {
        /* Hide the table on mobile, show cards */
        table.nice {
            display: none !important;
        }

        .mobile-card-list {
            display: flex !important;
            flex-direction: column;
            gap: 12px;
        }

        .mobile-entry-card {
            background: var(--background-tertiary, rgba(0, 0, 0, 0.05));
            border: 1px solid var(--border-color, #dee2e6);
            border-radius: 8px;
            padding: 12px;
            cursor: pointer;
            transition: background var(--transition-fast);
        }

        .mobile-entry-card:hover {
            background: var(--background-hover, rgba(153, 93, 243, 0.05));
        }

        .mobile-card-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 8px;
        }

        .mobile-card-user {
            font-weight: 600;
            font-size: 14px;
        }

        .mobile-card-time {
            font-size: 12px;
            color: var(--text-secondary, #6c757d);
            text-align: right;
        }

        .mobile-card-details {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-top: 8px;
        }

        .mobile-card-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
        }

        .mobile-card-label {
            font-weight: 500;
            color: var(--text-secondary, #6c757d);
        }

        .mobile-expand-icon {
            color: #6c757d;
            font-size: 12px;
            margin-top: 4px;
            text-align: center;
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
</style>
