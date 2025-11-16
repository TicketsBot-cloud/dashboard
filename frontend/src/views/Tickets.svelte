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

    export let currentRoute;
    let guildId = currentRoute.namedParams.id;

    let selectedColumns = [
        "ID",
        "Panel",
        "User",
        "Claimed By",
        "Last Message Time",
        "Awaiting Response",
    ];
    let sortMethod = "unclaimed";
    let onlyShowMyTickets = false;

    let filterSettings = {};
    let panels = [];
    let selectedPanel;

    let data = {
        tickets: [],
        panel_titles: {},
        resolved_users: {},
    };

    let filtered = [];

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

    async function loadTickets() {
        const filterParams = {
            id: filterSettings.ticketId,
            username: filterSettings.username,
            user_id: filterSettings.userId,
            claimed_by_id: filterSettings.claimedById,
            panel_id: selectedPanel,
        };

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

        data.tickets = data.tickets.map((ticket) => {
            if (ticket.claimed_by === "null") {
                ticket.claimed_by = null;
            }

            return ticket;
        });

        filterTickets();
    }

    const columnStorageKey = "ticket_list:selected_columns";
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
        await Promise.all([loadPanels(), loadTickets()]);
    });
</script>

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
            </div>
        </div>
        <div slot="footer">
            <Button icon="fas fa-search" on:click={applyFilters}>Filter</Button>
        </div>
    </Card>

    <Card footer={false}>
        <span slot="title"> Open Tickets </span>
        <ColumnSelector
            options={[
                "ID",
                "Panel",
                "User",
                "Opened Time",
                "Claimed By",
                "Last Message Time",
                "Awaiting Response",
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
