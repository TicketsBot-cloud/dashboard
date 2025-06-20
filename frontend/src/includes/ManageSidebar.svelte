{#if importModal}
  <ImportModal guildId={guildId} on:close={() => importModal = false}/>
{/if}
<section class="sidebar">
    <header>
        <img src="{iconUrl}" class="guild-icon" alt="Guild icon" width="50" height="50" on:error={handleIconLoadError} />
        {guild.name}
    </header>
    <nav>
        <ul class="nav-list">
            <ManageSidebarLink {currentRoute} title="← Back to servers" href="/" />

            {#if isAdmin}
                <ManageSidebarLink {currentRoute} title="Settings" icon="fa-cogs" href="/manage/{guildId}/settings" />
            {/if}

            {#if isMod}
                <ManageSidebarLink {currentRoute} title="Transcripts" icon="fa-copy" href="/manage/{guildId}/transcripts" />
            {/if}

            {#if isAdmin}
                <ManageSidebarLink {currentRoute} routePrefix="/manage/{guildId}/panels" title="Ticket Panels" icon="fa-mouse-pointer" href="/manage/{guildId}/panels" />

                <ManageSidebarLink {currentRoute} title="Forms" icon="fa-poll-h" href="/manage/{guildId}/forms" />
                <ManageSidebarLink {currentRoute} title="Staff Teams" icon="fa-users" href="/manage/{guildId}/teams" />
                <ManageSidebarLink {currentRoute} title="Integrations" icon="fa-robot" href="/manage/{guildId}/integrations" />
                <ManageSidebarLink {currentRoute} title="Import" icon="fa-file-import" href="/manage/{guildId}/import" />
            {/if}

            {#if isMod}
                <ManageSidebarLink {currentRoute} title="Tickets" icon="fa-ticket-alt" href="/manage/{guildId}/tickets" />
                <ManageSidebarLink {currentRoute} title="Blacklist" icon="fa-ban" href="/manage/{guildId}/blacklist" />
                <ManageSidebarLink {currentRoute} title="Tags" icon="fa-tags" href="/manage/{guildId}/tags" />
            {/if}
        </ul>
    </nav>
    <nav class="bottom">
        <hr/>
        <ul class="nav-list">
            <ManageSidebarLink {currentRoute} title="Documentation" icon="fa-book" href={DOCS_URL} newWindow />
            <ManageSidebarLink {currentRoute} title="Logout" icon="fa-sign-out-alt" href="/logout" />
        </ul>
    </nav>
</section>

<style>
    .sidebar {
        display: flex;
        flex-direction: column;
        align-self: flex-start;
        background-color: #272727;
        padding: 15px;
        width: 275px;
        border-radius: 6px;
        user-select: none;
    }

    header {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 10px;

        font-weight: bold;

        padding: 6px 10px;
        border-radius: 4px;

        background: linear-gradient(33.3deg, #873ef5 0%, #995DF3 100%);
        box-shadow: 0 6px 6px rgba(10, 10, 10, .1), 0 0 0 1px rgba(10, 10, 10, .1);
    }

    .guild-icon {
        width: 48px;
        height: 48px;
        border-radius: 50%;
    }

    nav > ul {
        list-style-type: none;
        padding: 0;
        margin: 0;
    }

    nav hr {
        width: 40%;
        padding-left: 20px;
    }

    @media (max-width: 800px) {
        .sidebar {
            display: none;
        }
    }
</style>

<script>
    import {onMount} from "svelte";
    import axios from "axios";
    import {API_URL, DOCS_URL} from "../js/constants";
    import {notifyError, withLoadingScreen} from "../js/util";
    import {getIconUrl, getDefaultIcon} from "../js/icons";
    import ManageSidebarLink from "./ManageSidebarLink.svelte";
    import ManageSidebarButton from "./ManageSidebarButton.svelte";
    import SubNavigation from "./SubNavigation.svelte";
    import SubNavigationLink from "./SubNavigationLink.svelte";

    import ImportModal from "../components/manage/ImportModal.svelte";

    export let currentRoute;
    export let permissionLevel;

    let importModal = false;

    $: isAdmin = permissionLevel >= 2;
    $: isMod = permissionLevel >= 1;
    $: isUser = permissionLevel >= 0;

    let guildId = currentRoute.namedParams.id;

    let guild = {};
    let iconUrl = "";

    let retried = false;
    function handleIconLoadError(e) {
        if (retried) return;

        retried = true;
        iconUrl = getDefaultIcon(guildId);
    }

    async function loadGuild() {
        const res = await axios.get(`${API_URL}/api/${guildId}/guild`);
        if (res.status !== 200) {
            notifyError(res.data.error);
            return;
        }

        guild = res.data;
    }

    function checkGuildCache(id, newIcon, newName) {
        // Retrieve the guilds array from localStorage
        let guilds = JSON.parse(window.localStorage.getItem('guilds')) || [];

        // Find the guild with the specified id
        let guild = guilds.find(g => g.id === id);

        // If the guild is found, update its icon and name
        if (guild) {
            let updated = false;
            if (guild.icon !== newIcon) {
                guild.icon = newIcon;
                updated = true;
            }
            if (guild.name !== newName) {
                guild.name = newName;
                updated = true;
            }
            // Save the updated guilds array back to localStorage if there were changes
            if (updated) {
                window.localStorage.setItem('guilds', JSON.stringify(guilds));
            }
        } else {
            console.error(`Guild with id ${id} not found`);
        }
    }

    onMount(async () => {
        await withLoadingScreen(async () => {
            await loadGuild();

            iconUrl = getIconUrl(guildId, guild.icon);
            checkGuildCache(guildId, guild.icon, guild.name);
        })
    });
</script>