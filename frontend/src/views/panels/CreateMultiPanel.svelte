<main>
    <a href="/manage/{guildId}/panels" class="link">
        <i class="fas fa-arrow-left"></i>
        Back to Panels
    </a>
    <Card footer={false}>
        <span slot="title">Create Multi-Panel</span>
        <div slot="body" class="card-body">
            <p>Note: The panels which you wish to combine into a multi-panel must already exist</p>

            {#if !$loadingScreen}
                <div style="margin-top: 10px">
                    <MultiPanelCreationForm {guildId} {channels} {panels} {emojis} bind:data={multiPanelCreateData} bind:panelCustomizations/>

                    <div class="submit-wrapper">
                        <Button icon="fas fa-paper-plane" fullWidth={true} on:click={createMultiPanel}>Create
                        </Button>
                    </div>
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

    .card-body {
        display: flex;
        flex-direction: column;
        width: 100%;
    }

    .submit-wrapper {
        margin: 1vh auto auto;
        width: 30%;
    }
</style>

<script>
    import {loadingScreen} from "../../js/stores";
    import MultiPanelCreationForm from "../../components/manage/MultiPanelCreationForm.svelte";
    import Button from "../../components/Button.svelte";
    import Card from "../../components/Card.svelte";
    import {onMount} from "svelte";
    import {notifyError, removeBlankEmbedFields, setBlankStringsToNull, withLoadingScreen} from "../../js/util";
    import {loadChannels, loadPanels, loadEmojis} from "../../js/common";
    import axios from "axios";
    import {API_URL} from "../../js/constants";
    import {navigateTo} from "svelte-router-spa";

    export let currentRoute;
    let guildId = currentRoute.namedParams.id;

    let channels = [];
    let panels = [];
    let emojis = [];

    let multiPanelCreateData;
    let panelCustomizations = {};

    async function createMultiPanel() {
        const data = structuredClone(multiPanelCreateData);

        // Transform panels array to include customizations
        data.panels = data.panels.map(panelId => ({
            panel_id: panelId,
            custom_emoji_name: panelCustomizations[panelId]?.custom_emoji_name?.trim() || null,
            custom_emoji_id: panelCustomizations[panelId]?.custom_emoji_id || null,
            custom_label: panelCustomizations[panelId]?.custom_label?.trim() || null,
            description: panelCustomizations[panelId]?.description?.trim() || null
        }));

        setBlankStringsToNull(data);
        removeBlankEmbedFields(data);

        const res = await axios.post(`${API_URL}/api/${guildId}/multipanels`, data);
        if (res.status !== 200) {
            notifyError(res.data);
        } else {
            navigateTo(`/manage/${guildId}/panels?created=true`)
        }
    }

    onMount(async () => {
        await withLoadingScreen(async () => {
            await Promise.all([
                loadChannels(guildId).then(r => channels = r).catch(e => notifyError(e)),
                loadPanels(guildId).then(r => panels = r).catch(e => notifyError(e)),
                loadEmojis(guildId).then(r => emojis = r).catch(e => notifyError(e)),
            ])
        });
    });
</script>