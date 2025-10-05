<script>
    import axios from "axios";
    import { fade } from "svelte/transition";
    import { notifyError, withLoadingScreen } from "../js/util";
    import { setDefaultHeaders } from "../includes/Auth.svelte";
    import { API_URL } from "../js/constants.js";
    import Guild from "../components/Guild.svelte";
    import Card from "../components/Card.svelte";
    import InviteBadge from "../components/InviteBadge.svelte";
    import Button from "../components/Button.svelte";
    import { loadingScreen, permissionLevelCache } from "../js/stores";

    setDefaultHeaders();

    let guilds = window.localStorage.getItem("guilds")
        ? JSON.parse(window.localStorage.getItem("guilds"))
        : [];
    if (guilds.length > 0) {
        guilds = guilds.sort((a, b) => {
            if (a.permission_level > 0 && b.permission_level <= 0) return -1;
            if (a.permission_level <= 0 && b.permission_level > 0) return 1;
            return a.name?.localeCompare(b.name);
        });
    }

    async function refreshGuilds() {
        await withLoadingScreen(async () => {
            const res = await axios.post(`${API_URL}/user/guilds/reload`);
            if (res.status !== 200) {
                notifyError(res.data.error);
                return;
            }

            if (
                !res.data.success &&
                res.data["reauthenticate_required"] === true
            ) {
                window.location.href = "/login";
                return;
            }

            guilds = res.data.guilds;
            window.localStorage.setItem("guilds", JSON.stringify(guilds));
        });
    }

    loadingScreen.set(false);
</script>

<div class="content">
    <div class="card-wrapper">
        <Card footer={false} fill={false}>
            <span slot="title"> Servers </span>

            <div slot="body" style="width: 100%">
                <span class="flex-container">
                    <h2>Your Servers</h2>
                </span>
                <div id="guild-container">
                    <InviteBadge />

                    {#each guilds as guild}
                        {#if guild.permission_level > 0}
                            <Guild {guild} />
                        {/if}
                    {/each}
                </div>

                <br />
                <span class="flex-container">
                    <h2>Other Servers</h2>
                    <i>You do not have access to managing these servers.</i>
                </span>

                <div id="guild-container">
                    {#each guilds as guild}
                        {#if guild.permission_level === 0}
                            <Guild {guild} />
                        {/if}
                    {/each}
                </div>

                <div class="flex-container" id="refresh-container">
                    <Button icon="fas fa-sync" on:click={refreshGuilds}>
                        Refresh list
                    </Button>
                </div>
            </div>
        </Card>
    </div>
</div>

<style>
    .content {
        display: flex;
        height: 100%;
        width: 100%;
        justify-content: center;
    }

    .card-wrapper {
        display: block;
        width: 75%;
        margin-top: 5%;
    }

    #guild-container {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: space-evenly;
        padding-top: 10px;
    }

    #refresh-container {
        display: flex;
        justify-content: center;

        margin: 10px 0;
        color: white;
    }

    @media (max-width: 576px) {
        .card-wrapper {
            width: 100%;
        }
    }
</style>
