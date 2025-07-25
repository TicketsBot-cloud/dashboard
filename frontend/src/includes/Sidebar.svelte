<script>
    import {Navigate} from 'svelte-router-spa'
    import {PREMIUM_URL, WHITELABEL_DISABLED, PREMIUM_DISABLED} from "../js/constants";
    import {getAvatarUrl, getDefaultIcon} from "../js/icons";
    import {onMount} from "svelte";
    import {fade} from "svelte/transition";
    import { showSidebar } from '../js/stores';

    export let userData;

    $: showSidebar.subscribe(v => $showSidebar = v);

    let hasFailed = false;
    function handleAvatarLoadError(e, userId) {
        if (!hasFailed) {
            hasFailed = true;
            e.target.src = getDefaultIcon(userId);
        }
    }

    // Burger menu state
    let sidebarRef;

    // Close sidebar when clicking outside
    function handleClickOutside(e) {
        if ($showSidebar && sidebarRef && !sidebarRef.contains(e.target) && !e.target.closest('.burger-menu')) {
            showSidebar.set(false);
        }
    }

    onMount(() => {
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    });
</script>

{#if $showSidebar}
    <div
        class="sidebar-modal-backdrop"
        transition:fade
        on:click={() => showSidebar.set(false)}
        on:keydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') showSidebar.set(false); }}
        aria-label="Close sidebar"
    ></div>
{/if}

<!-- Sidebar: normal on desktop, overlay on mobile when showSidebar -->
<div class="sidebar" bind:this={sidebarRef} class:burger={$showSidebar} transition:fade="{{duration: 200}}">
  <div class="sidebar-container" id="sidebar-nav">
    <div class="inner">
      <Navigate to="/" styles="sidebar-link">
        <div class="sidebar-element">
          <i class="fas fa-server"></i>
          <span class="sidebar-text">Servers</span>
        </div>
      </Navigate>
      {#if !WHITELABEL_DISABLED}
        <!-- -1 = None, 0 = Premium, 1 = Whitelabel -->
        <a href="/whitelabel" target="_blank" class="sidebar-link">
          <div class="sidebar-element">
            <i class="fas fa-tag"></i>
            <span class="sidebar-text">{userData.tier === 1 ? "Manage Whitelabel" : userData.tier === 0 ? "Upgrade Whitelabel" : "Purchase Whitelabel"}</span>
          </div>
        </a>
      {/if}
      {#if !PREMIUM_DISABLED}
        {#if userData.tier === 0}
          <Navigate to="/premium/select-servers" styles="sidebar-link">
            <div class="sidebar-element">
              <i class="fas fa-edit"></i>
              <span class="sidebar-text">Manage Premium</span>
            </div>
          </Navigate>
        {:else if userData.tier === -1}
          <a href={PREMIUM_URL} target="_blank" class="sidebar-link">
            <div class="sidebar-element">
              <i class="fas fa-edit"></i>
              <span class="sidebar-text">Purchase Premium</span>
            </div>
          </a>
        {/if}
      {/if}
      {#if userData.admin}
        <Navigate to="/admin/bot-staff" styles="sidebar-link">
          <div class="sidebar-element">
            <i class="fa-solid fa-user-secret"></i>
            <span class="sidebar-text">Admin</span>
          </div>
        </Navigate>
      {/if}
    </div>
  </div>
  <div class="sidebar-container">
    <Navigate to="/logout" onclick="clearLocalStorage();" styles="sidebar-link">
      <div class="sidebar-element">
        <i class="fas fa-sign-out-alt"></i>
        <span class="sidebar-text">Logout</span>
      </div>
    </Navigate>
    <a href="/" class="sidebar-link">
      <div class="sidebar-element user-element">
        <img class="avatar" src={getAvatarUrl(userData.id, userData.avatar)}
        on:error={(e) => handleAvatarLoadError(e, userData.id)} alt="Avatar"/>
        <span class="sidebar-text">{userData.username}</span>
      </div>
    </a>
  </div>
</div>

<style>
    .sidebar {
        display: flex;
        flex-direction: column;
        height: calc(100% - 30px);
        width: 16.6%;
        padding: 15px 0;
        background-color: #272727;
        float: left;
        background-size: cover;
        overflow-x: hidden !important;
        min-width: 250px;
    }
    .inner {
        width: 100%;
    }

    .sidebar-element {
        display: flex;
        align-items: center;
        width: 100%;
        cursor: pointer;
        padding: 5px 4%;
    }

    .sidebar-element:hover {
        background-color: #121212;
        transition: background-color 0.5s ease;
    }

    .sidebar-element i {
        width: 25px;
        text-align: center;
    }

    /*
     * Need global for Navigate link styling
     */
    :global(.sidebar-link) {
        display: flex;
        align-items: center;
        color: white !important;
        font-size: 18px;
        text-decoration: none;
        text-wrap: nowrap;
    }

    .sidebar-text {
        margin-left: 10px;
        display: flex;
        align-items: center;
    }

    #sidebar-nav {
        display: flex;
        flex: 1;
    }

    .avatar {
        width: 25px;
        height: 25px;
        display: block;
        background-size: cover !important;
        border-radius: 50%;
    }

    .sidebar-modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.5);
        z-index: 1200;
    }

    .sidebar.burger {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        min-width: unset;
        height: auto;
        max-height: 90vh;
        z-index: 1202;
        box-shadow: 0 14px 24px rgba(0,0,0,0.25);
        animation: slideDownSidebar 0.2s ease;
        border-radius: 0 0 12px 12px;
        overflow-y: auto;
        background-color: #272727;
    }

    @keyframes slideDownSidebar {
        from { transform: translateY(-100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }

    @media (max-width: 950px) {
        .sidebar {
            display: none;
        }
        .sidebar.burger {
            display: flex;
            flex-direction: column;
        }
        .sidebar-container:first-child {
            margin-bottom: 16px;
        }
        .sidebar.burger i {
            font-size: 1.4rem;
        }
        .sidebar.burger .sidebar-text {
            font-size: 1.5rem;
        }
    }
</style>
