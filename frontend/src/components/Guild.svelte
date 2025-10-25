<script>
    import Tooltip from "svelte-tooltip";
    import { DOCS_URL } from "../js/constants";
    import NoPermissionModal from "./NoPermissionModal.svelte";

    export let guild;

    let showNoPermissionModal = false;

    function isAnimated() {
        if (guild.icon === undefined || guild.icon === "") {
            return false;
        } else {
            return guild.icon.startsWith("a_");
        }
    }

    function getIconUrl() {
        if (isAnimated()) {
            return `https:\/\/cdn.discordapp.com/icons/${guild.id}/${guild.icon}.gif?size=256`;
        } else {
            return `https:\/\/cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=256`;
        }
    }

    async function goto(guildId) {
        if (guild.permission_level === 2) {
            window.location.href = `/manage/${guildId}/settings`;
        } else if (guild.permission_level === 1) {
            window.location.href = `/manage/${guildId}/transcripts`;
        } else {
            return;
        }
    }

    function openNoPermissionModal(event) {
        event.stopPropagation();
        showNoPermissionModal = true;
    }

    function closeNoPermissionModal() {
        showNoPermissionModal = false;
    }
</script>

<div
    class="guild-badge"
    on:click={goto(guild.id)}
    class:disabled={guild.permission_level === 0}
>
    <div class="guild-icon-bg">
        {#if guild.icon === undefined || guild.icon === ""}
            <i
                class="fas fa-question guild-icon-fa"
                class:disabled={guild.permission_level === 0}
            ></i>
        {:else}
            <img
                class="guild-icon"
                src={getIconUrl()}
                alt="Guild Icon"
                class:disabled={guild.permission_level === 0}
            />
        {/if}
    </div>

    <div class="text-wrapper" class:disabled={guild.permission_level === 0}>
        <span class="guild-name">
            {guild.name}
        </span>
        {#if guild.permission_level === 0}
            <span class="no-permission">
                No permission
                <Tooltip
                    tip="Click to learn how to get access"
                    top
                    color="#121212"
                >
                    <button
                        class="info-button"
                        on:click={openNoPermissionModal}
                        aria-label="Learn how to get access"
                    >
                        <i class="fas fa-circle-question"></i>
                    </button>
                </Tooltip>
            </span>
        {/if}
    </div>
</div>

{#if showNoPermissionModal}
    <NoPermissionModal
        isOwner={guild.owner === true}
        on:close={closeNoPermissionModal}
    />
{/if}

<style>
    :global(.guild-badge) {
        display: flex;
        align-items: center;
        box-shadow: 0 4px 4px rgba(0, 0, 0, 0.25);

        width: 33%;
        background-color: #0a0e1b;
        height: 100px;
        margin-bottom: 10px;
        border-radius: 10px;
        cursor: pointer;
    }

    .guild-badge.disabled {
        cursor: default;
    }

    @media (max-width: 950px) {
        :global(.guild-badge) {
            width: 100%;
        }
    }

    :global(.guild-icon-bg) {
        height: 80px;
        width: 80px;
        background-color: #1a1f2e;
        border-radius: 50%;
        margin-left: 10px;
    }

    :global(.guild-icon) {
        height: 80px;
        width: 80px;
        border-radius: 50%;
    }

    :global(.guild-icon-fa) {
        border-radius: 50%;
        color: white;
        font-size: 60px !important;
        width: 80px;
        height: 80px;
        text-align: center;
        margin-top: 10px;
    }

    :global(.guild-name) {
        color: white !important;
    }

    .text-wrapper.disabled > .guild-name {
        opacity: 45%;
    }

    .guild-icon-bg > *.disabled {
        opacity: 25%;
    }

    .text-wrapper {
        display: flex;
        flex-direction: column;
        padding-left: 10px;
    }

    .text-wrapper > .no-permission {
        opacity: 75%;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .info-button {
        background: none;
        border: none;
        color: #5865f2;
        cursor: pointer;
        padding: 0;
        margin: 0;
        font-size: 14px;
        transition: all 0.3s ease;
        display: inline-flex;
        align-items: center;
        filter: drop-shadow(0 0 0px rgba(88, 101, 242, 0));
    }

    .info-button:hover {
        color: #7289da;
        transform: scale(1.2) rotate(15deg);
        filter: drop-shadow(0 0 6px rgba(88, 101, 242, 0.6));
    }

    .info-button:active {
        transform: scale(1.1) rotate(10deg);
    }

    .info-button:focus {
        outline: 2px solid #5865f2;
        outline-offset: 2px;
        border-radius: 2px;
    }
</style>
