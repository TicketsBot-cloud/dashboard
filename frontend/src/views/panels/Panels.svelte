<script>
    import Card from "../../components/Card.svelte";
    import {
        checkForParamAndRewrite,
        notifyError,
        notifySuccess,
        withLoadingScreen,
    } from "../../js/util";
    import axios from "axios";
    import { API_URL } from "../../js/constants";
    import { setDefaultHeaders } from "../../includes/Auth.svelte";
    import Button from "../../components/Button.svelte";
    import ActionDropdown from "../../components/ActionDropdown.svelte";
    import ConfirmationModal from "../../components/ConfirmationModal.svelte";
    import { Navigate } from "svelte-router-spa";
    import {
        loadChannels,
        loadMultiPanels,
        loadPanels,
        loadPremium,
    } from "../../js/common";

    export let currentRoute;

    setDefaultHeaders();

    let guildId = currentRoute.namedParams.id;

    let channels = [];
    let panels = [];
    let multiPanels = [];
    let isPremium = false;

    let panelToDelete = null;
    let multiPanelToDelete = null;

    async function resendPanel(panelId) {
        const res = await axios.post(
            `${API_URL}/api/${guildId}/panels/${panelId}`,
        );
        if (res.status !== 200) {
            notifyError(res.data.error);
            return;
        }

        notifySuccess("Panel resent successfully");
    }

    async function deletePanel(panelId) {
        const res = await axios.delete(
            `${API_URL}/api/${guildId}/panels/${panelId}`,
        );
        if (res.status !== 200) {
            notifyError(res.data.error);
            return;
        }

        panels = panels.filter((p) => p.panel_id !== panelId);
        panelToDelete = null;
    }

    async function resendMultiPanel(id) {
        const res = await axios.post(
            `${API_URL}/api/${guildId}/multipanels/${id}`,
        );
        if (res.status !== 200) {
            notifyError(res.data.error);
            return;
        }

        notifySuccess("Multipanel resent successfully");
    }

    async function deleteMultiPanel(id) {
        const res = await axios.delete(
            `${API_URL}/api/${guildId}/multipanels/${id}`,
        );
        if (res.status !== 200) {
            notifyError(res.data.error);
            return;
        }

        multiPanels = multiPanels.filter((p) => p.id !== id);
        multiPanelToDelete = null;
    }

    withLoadingScreen(async () => {
        await Promise.all([
            loadChannels(guildId)
                .then((r) => (channels = r))
                .catch((e) => notifyError(e)),
            loadPremium(guildId, false)
                .then((r) => (isPremium = r))
                .catch((e) => notifyError(e)),
            loadPanels(guildId)
                .then((r) => (panels = r))
                .catch((e) => notifyError(e)),
            loadMultiPanels(guildId)
                .then((r) => (multiPanels = r))
                .catch((e) => notifyError(e)),
        ]);

        if (checkForParamAndRewrite("created")) {
            notifySuccess("Panel created successfully");
        }

        if (checkForParamAndRewrite("edited")) {
            notifySuccess("Panel edited successfully");
        }

        if (checkForParamAndRewrite("notfound")) {
            notifyError("Panel not found");
        }
    });
</script>

{#if panelToDelete !== null}
    <ConfirmationModal
        icon="fas fa-trash-can"
        isDangerous
        on:cancel={() => (panelToDelete = null)}
        on:confirm={() => deletePanel(panelToDelete.panel_id)}
    >
        <span slot="body"
            >Are you sure you want to delete the panel {panelToDelete.title}?</span
        >
        <span slot="confirm">Delete</span>
    </ConfirmationModal>
{/if}

{#if multiPanelToDelete !== null}
    <ConfirmationModal
        icon="fas fa-trash-can"
        isDangerous
        on:cancel={() => (multiPanelToDelete = null)}
        on:confirm={() => deleteMultiPanel(multiPanelToDelete.id)}
    >
        <span slot="body"
            >Are you sure you want to delete the multi-panel
            {multiPanelToDelete.embed?.title || "Open a ticket!"}?</span
        >
        <span slot="confirm">Delete</span>
    </ConfirmationModal>
{/if}

<div class="wrapper">
    <div class="col">
        <div class="row">
            <Card footer={false}>
                <span slot="title">Ticket Panels</span>
                <div slot="body" class="card-body panels">
                    <div class="controls">
                        <p>
                            Your panel quota: <b
                                >{panels.length} / {isPremium ? "∞" : "3"}</b
                            >
                        </p>
                        <Navigate
                            to="/manage/{guildId}/panels/create"
                            styles="link"
                        >
                            <Button
                                icon="fas fa-plus"
                                disabled={!isPremium && panels.length >= 3}
                                >New Panel</Button
                            >
                        </Navigate>
                    </div>

                    <table style="margin-top: 20px">
                        <thead>
                            <tr>
                                <th>Channel</th>
                                <th>Panel Title</th>
                                <th>Support Hours</th>
                                <th style="width: 60px">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each panels as panel}
                                <tr>
                                    <td
                                        >#{channels.find(
                                            (c) => c.id === panel.channel_id,
                                        )?.name ?? "Unknown Channel"}</td
                                    >
                                    <td>{panel.title}</td>
                                    <td>
                                        {#if panel.has_support_hours}
                                            <span
                                                class="support-hours-badge"
                                                class:active={panel.is_currently_active}
                                                class:inactive={!panel.is_currently_active}
                                            >
                                                {panel.is_currently_active
                                                    ? "Open"
                                                    : "Closed"}
                                            </span>
                                        {:else}
                                            <span
                                                class="support-hours-badge always-active"
                                                >24/7</span
                                            >
                                        {/if}
                                    </td>
                                    <td class="actions-cell">
                                        <ActionDropdown bind:this={panel.dropdownRef}>
                                            <button
                                                disabled={panel.force_disabled}
                                                on:click={() => {
                                                    resendPanel(panel.panel_id);
                                                    panel.dropdownRef?.close();
                                                }}
                                            >
                                                <i class="fas fa-paper-plane"
                                                ></i>
                                                <span>Resend</span>
                                            </button>
                                            <Navigate
                                                to="/manage/{guildId}/panels/edit/{panel.panel_id}"
                                                styles="link"
                                            >
                                                <button
                                                    disabled={panel.force_disabled}
                                                >
                                                    <i class="fas fa-edit"></i>
                                                    <span>Edit</span>
                                                </button>
                                            </Navigate>
                                            <div class="divider"></div>
                                            <button
                                                class="danger"
                                                on:click={() => {
                                                    panelToDelete = panel;
                                                    panel.dropdownRef?.close();
                                                }}
                                            >
                                                <i class="fas fa-trash"></i>
                                                <span>Delete</span>
                                            </button>
                                        </ActionDropdown>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    </div>
    <div class="col">
        <div class="row">
            <Card footer={false}>
                <span slot="title">Multi-Panels</span>
                <div slot="body" class="card-body">
                    <div class="controls">
                        <Navigate
                            to="/manage/{guildId}/panels/create-multi"
                            styles="link"
                        >
                            <Button icon="fas fa-plus">New Multi-Panel</Button>
                        </Navigate>
                    </div>

                    <table style="margin-top: 20px">
                        <thead>
                            <tr>
                                <th>Panel Title</th>
                                <th style="width: 60px">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each multiPanels as panel}
                                <tr>
                                    <td
                                        >{panel.embed?.title ||
                                            "Open a ticket!"}</td
                                    >
                                    <td class="actions-cell">
                                        <ActionDropdown bind:this={panel.dropdownRef}>
                                            <button
                                                on:click={() => {
                                                    resendMultiPanel(panel.id);
                                                    panel.dropdownRef?.close();
                                                }}
                                            >
                                                <i class="fas fa-paper-plane"
                                                ></i>
                                                <span>Resend</span>
                                            </button>
                                            <Navigate
                                                to="/manage/{guildId}/panels/edit-multi/{panel.id}"
                                                styles="link"
                                            >
                                                <button>
                                                    <i class="fas fa-edit"></i>
                                                    <span>Edit</span>
                                                </button>
                                            </Navigate>
                                            <div class="divider"></div>
                                            <button
                                                class="danger"
                                                on:click={() => {
                                                    multiPanelToDelete = panel;
                                                    panel.dropdownRef?.close();
                                                }}
                                            >
                                                <i class="fas fa-trash"></i>
                                                <span>Delete</span>
                                            </button>
                                        </ActionDropdown>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
        <div class="row"></div>
    </div>
</div>

<style>
    .wrapper {
        display: flex;
        flex-direction: row;
        height: 100%;
        width: 100%;
        gap: 2%;
    }

    .col {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 50%;
    }

    .row {
        display: flex;
        width: 100%;
        margin-bottom: 2%;
    }

    .card-body {
        width: 100%;
    }

    .card-body.panels {
        display: flex;
        flex-direction: column;
    }

    .card-body > .controls {
        display: flex;
        justify-content: right;
        align-items: center;
        gap: 2%;
    }

    .card-body.panels > .controls {
        justify-content: space-between;
    }

    @media only screen and (max-width: 1400px) {
        .wrapper {
            flex-direction: column;
        }

        .col {
            width: 100%;
        }
    }

    @media only screen and (max-width: 576px) {
        .row {
            width: 100%;
        }
    }

    table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
    }

    thead {
        background: var(--background-tertiary);
    }

    th {
        text-align: left;
        font-weight: 500;
        font-size: 0.875rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--border-color);
        padding: 12px 16px;
    }

    th:first-child {
        border-top-left-radius: var(--border-radius-sm);
    }

    th:last-child {
        border-top-right-radius: var(--border-radius-sm);
    }

    tbody tr {
        border-bottom: 1px solid var(--border-color);
        transition: all var(--transition-fast);
    }

    tbody tr:hover {
        background: var(--background-hover);
    }

    tr:last-child {
        border-bottom: none;
    }

    td {
        padding: 16px;
        color: var(--text-primary);
        font-size: 0.95rem;
    }

    th {
        padding: 0 10px;
    }

    th.max,
    td.max {
        width: 100%;
    }

    td.actions-cell {
        text-align: center;
    }

    .support-hours-badge {
        padding: 6px 12px;
        border-radius: var(--border-radius-md);
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        display: inline-block;
    }

    .support-hours-badge.always-active {
        background: rgba(58, 123, 224, 0.15);
        color: #3a7be0;
        border: 1px solid rgba(58, 123, 224, 0.3);
    }

    .support-hours-badge.active {
        background: rgba(94, 204, 98, 0.15);
        color: #5ecc62;
        border: 1px solid rgba(94, 204, 98, 0.3);
    }

    .support-hours-badge.inactive {
        background: rgba(166, 166, 172, 0.15);
        color: #a6a6ac;
        border: 1px solid rgba(166, 166, 172, 0.3);
    }

    .support-hours-badge.active {
        background-color: rgba(102, 187, 106, 0.15);
        color: #66bb6a;
        border: 1px solid rgba(102, 187, 106, 0.3);
    }

    .support-hours-badge.inactive {
        background-color: rgba(244, 67, 54, 0.15);
        color: #ef5350;
        border: 1px solid rgba(244, 67, 54, 0.3);
    }

    .support-hours-badge.always-active {
        background-color: rgba(79, 195, 247, 0.15);
        color: #4fc3f7;
        border: 1px solid rgba(79, 195, 247, 0.3);
    }
</style>
