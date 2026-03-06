<script>
    import { loadingScreen } from "../../js/stores";
    import Button from "../../components/Button.svelte";
    import Card from "../../components/Card.svelte";
    import PanelCreationForm from "../../components/manage/PanelCreationForm.svelte";
    import { setDefaultHeaders } from "../../includes/Auth.svelte";
    import {
        notifyError,
        notifySuccess,
        setBlankStringsToNull,
        withLoadingScreen,
    } from "../../js/util";
    import { onMount } from "svelte";
    import {
        loadChannels,
        loadEmojis,
        loadForms,
        loadPanels,
        loadPremium,
        loadRoles,
        loadSettings,
        loadTeams,
    } from "../../js/common";
    import axios from "axios";
    import { API_URL } from "../../js/constants";
    import { Navigate, navigateTo } from "svelte-router-spa";

    setDefaultHeaders();

    export let currentRoute;
    let guildId = currentRoute.namedParams.id;
    let panelId = parseInt(currentRoute.namedParams.panelid);

    let channels = [];
    let roles = [];
    let emojis = [];
    let teams = [];
    let forms = [];
    let isPremium = false;
    let settings = {};
    let panelData;
    let supportHours = [];

    async function editPanel() {
        setBlankStringsToNull(panelData);

        const res = await axios.patch(
            `${API_URL}/api/${guildId}/panels/${panelId}`,
            panelData,
        );
        if (res.status !== 200) {
            notifyError(res.data);
            return;
        }

        // Save support hours (free users get 1 panel, premium unlimited)
        if (
            panelData.support_hours &&
            panelData.support_hours.hours &&
            panelData.support_hours.hours.length > 0
        ) {
            try {
                const hoursRes = await axios.post(
                    `${API_URL}/api/${guildId}/panels/${panelId}/support-hours`,
                    panelData.support_hours,
                );
                if (hoursRes.status !== 200) {
                    notifyError(hoursRes.data.error);
                    return;
                }
            } catch (error) {
                if (error.response && error.response.status === 403) {
                    notifyError(
                        error.response.data.error ||
                            "Support hours quota exceeded",
                    );
                } else {
                    notifyError("Failed to save support hours");
                }
                return;
            }
        } else {
            // If no support hours, delete them
            await axios
                .delete(
                    `${API_URL}/api/${guildId}/panels/${panelId}/support-hours`,
                )
                .catch(() => {
                    // Ignore errors when deleting (might not exist)
                });
        }

        navigateTo(`/manage/${guildId}/panels?edited=true`);
    }

    onMount(async () => {
        await withLoadingScreen(async () => {
            let panels = [];

            await Promise.all([
                loadChannels(guildId)
                    .then((r) => (channels = r))
                    .catch((e) => notifyError(e)),
                loadRoles(guildId)
                    .then((r) => (roles = r))
                    .catch((e) => notifyError(e)),
                loadEmojis(guildId)
                    .then((r) => (emojis = r))
                    .catch((e) => notifyError(e)),
                loadTeams(guildId)
                    .then((r) => (teams = r))
                    .catch((e) => notifyError(e)),
                loadForms(guildId)
                    .then((r) => (forms = r))
                    .catch((e) => notifyError(e)),
                loadPremium(guildId, false)
                    .then((r) => (isPremium = r))
                    .catch((e) => notifyError(e)),
                loadPanels(guildId)
                    .then((r) => (panels = r))
                    .catch((e) => notifyError(e)),
                loadSettings(guildId)
                    .then((r) => (settings = r))
                    .catch((e) => notifyError(e)),
            ]);

            panelData = panels.find((p) => p.panel_id === panelId);
            if (!panelData) {
                navigateTo(`/manage/${guildId}/panels?notfound=true`);
            } else {
                // Load support hours for this panel
                try {
                    const hoursRes = await axios.get(
                        `${API_URL}/api/${guildId}/panels/${panelId}/support-hours`,
                    );
                    if (hoursRes.status === 200) {
                        panelData.support_hours = hoursRes.data;
                    }
                } catch (e) {
                    // Support hours are optional, so we don't show an error
                    panelData.support_hours = {
                        timezone: "Europe/London",
                        hours: [],
                    };
                }
            }
        });
    });
</script>

<main>
    <a href="/manage/{guildId}/panels" class="link">
        <i class="fas fa-arrow-left"></i>
        Back to Panels
    </a>
    <Card footer={false}>
        <span slot="title">Edit Panel</span>

        <div slot="body" class="body-wrapper">
            {#if !$loadingScreen}
                <PanelCreationForm
                    {guildId}
                    {panelId}
                    {channels}
                    {roles}
                    {emojis}
                    {teams}
                    {forms}
                    {isPremium}
                    {settings}
                    bind:data={panelData}
                    seedDefault={false}
                />
                <div class="submit-wrapper">
                    <Button
                        icon="fas fa-floppy-disk"
                        fullWidth={true}
                        on:click={editPanel}>Save</Button
                    >
                </div>
            {/if}
        </div>
    </Card>
</main>

<style>
    main {
        display: flex;
        flex-direction: column;
        width: 100%;
        row-gap: 1vh;
    }

    main > a {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 18px;
    }

    .body-wrapper {
        display: flex;
        flex-direction: column;
    }

    .submit-wrapper {
        margin: 1vh auto auto;
        width: 30%;
    }
</style>
