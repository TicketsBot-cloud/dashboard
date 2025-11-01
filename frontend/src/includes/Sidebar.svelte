<script>
    import { Navigate } from "svelte-router-spa";
    import { WHITELABEL_DISABLED } from "../js/constants";
    import { getAvatarUrl, getDefaultIcon } from "../js/icons";
    import { clearLocalStorage } from "./Auth.svelte";

    export let userData;

    let hasFailed = false;
    function handleAvatarLoadError(e, userId) {
        if (!hasFailed) {
            hasFailed = true;
            e.target.src = getDefaultIcon(userId);
        }
    }
</script>

<div class="sidebar">
    <div class="sidebar-container" id="sidebar-nav">
        <div class="inner">
            <Navigate to="/" styles="sidebar-link">
                <div class="sidebar-element">
                    <i class="fas fa-server sidebar-icon"></i>
                    <span class="sidebar-text">Servers</span>
                </div>
            </Navigate>
            {#if !WHITELABEL_DISABLED}
                <Navigate to="/whitelabel" styles="sidebar-link">
                    <div class="sidebar-element">
                        <i class="fas fa-edit sidebar-icon"></i>
                        <span class="sidebar-text">Whitelabel</span>
                    </div>
                </Navigate>
            {/if}
            {#if userData.admin}
                <Navigate to="/admin/bot-staff" styles="sidebar-link">
                    <div class="sidebar-element">
                        <i class="fa-solid fa-user-secret sidebar-icon"></i>
                        <span class="sidebar-text">Admin</span>
                    </div>
                </Navigate>
            {/if}
        </div>
    </div>
    <div class="sidebar-container">
        <div class="sidebar-element">
            <a
                href="/logout"
                class="sidebar-link"
                on:click={(e) => {
                    clearLocalStorage();
                    window.location.href = "/logout";
                }}
            >
                <i class="sidebar-icon fas fa-sign-out-alt sidebar-icon"></i>
                <span class="sidebar-text">Logout</span>
            </a>
        </div>
        <div class="sidebar-element user-element">
            <a class="sidebar-link">
                <img
                    class="avatar"
                    src={getAvatarUrl(userData.id, userData.avatar)}
                    on:error={(e) => handleAvatarLoadError(e, userData.id)}
                    alt="Avatar"
                />

                <span class="sidebar-text">{userData.username}</span>
            </a>
        </div>
    </div>
</div>

<style>
    .sidebar {
        display: flex;
        flex-direction: column;
        height: 100vh;
        width: 16.6%;
        background: linear-gradient(180deg, #1a1f2e 0%, #141827 100%);
        background-size: cover;
        overflow-x: hidden !important;
        overflow-y: auto;
        min-width: 250px;
        position: sticky;
        top: 0;
        border-right: 1px solid var(--border-color);
    }

    .sidebar-container {
        padding: 0 1rem;
    }

    .inner {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding-top: 1.5rem;
    }

    .sidebar-element {
        display: flex;
        align-items: center;
        width: 100%;
        cursor: pointer;
        padding: 0.75rem 1rem;
        border-radius: var(--border-radius-md);
        transition: all var(--transition-fast);
    }

    .sidebar-element:hover {
        background-color: var(--background-hover);
    }

    #custom-image {
        max-height: 70px;
        max-width: 90%;
    }

    :global(.sidebar-link) {
        display: flex;
        align-items: center;
        color: var(--text-secondary) !important;
        font-size: 0.9375rem;
        font-weight: 500;
        text-decoration: none;
        transition: color var(--transition-fast);
    }

    :global(.sidebar-link:hover) {
        color: var(--text-primary) !important;
    }

    .sidebar-icon {
        width: 20px;
        font-size: 1.125rem;
        opacity: 0.7;
        transition: opacity var(--transition-fast);
    }

    .sidebar-element:hover .sidebar-icon {
        opacity: 1;
    }

    .sidebar-text {
        margin-left: 0.875rem;
        display: flex;
        align-items: center;
    }

    #sidebar-nav {
        display: flex;
        flex: 1;
        padding-bottom: 1rem;
    }

    .ref {
        display: flex;
        justify-content: center;
    }

    .ref-wrapper {
        display: flex;
        justify-content: center;
        padding: 10px 0;
        margin: 0 !important;
    }

    .avatar {
        width: 32px;
        height: 32px;
        display: block;
        background-size: cover !important;
        border-radius: 50%;
        border: 2px solid var(--border-color);
    }

    .user-element {
        border-top: 1px solid var(--border-color);
        padding-top: 0.75rem;
        margin-top: 0.75rem;
    }

    .user-element .sidebar-link {
        cursor: default;
    }

    .user-element .sidebar-text {
        font-weight: 600;
        color: var(--text-primary) !important;
    }

    @media (max-width: 950px) {
        .sidebar {
            flex-direction: row;
            width: 100%;
            height: unset;
            min-width: unset;
            overflow: visible !important;
            border-right: none;
            border-bottom: 1px solid var(--border-color);
            padding: 0.75rem 1rem;
        }

        .ref {
            display: none;
        }

        .sidebar-container {
            margin-bottom: unset;
            padding: 0;
        }

        .inner {
            display: flex;
            flex-direction: row;
            gap: 0.5rem;
        }

        .sidebar-element {
            width: unset;
            padding: 0.625rem 1rem;
        }

        :global(.sidebar-link) {
            width: unset;
        }

        .user-element {
            display: none;
        }
    }
</style>
