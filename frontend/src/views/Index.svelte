<div class="content">
  <div class="card-wrapper">
    <Card footer={false} fill={false}>
      <span slot="title">
        Servers
      </span>
      <span slot="title-items" class="burger-menu-container">
        <!-- Burger menu button for mobile -->
        <button class="burger-menu" type="button" on:click={toggleBurger} aria-label="Open sidebar">
          <i class="fas fa-bars"></i>
        </button>
      </span>

      <div slot="body" style="width: 100%">
        <span class="flex-container">
          <h2>Your Servers</h2>
        </span>
        <div id="guild-container">
          <InviteBadge/>

          {#each guilds as guild}
            {#if guild.permission_level > 0}
              <Guild guild={guild}/>
            {/if}
          {/each}
        </div>

        <br/>
        <span class="flex-container">
          <h2>Other Servers</h2>
          <i>You do not have access to managing these servers.</i>
        </span>

        <div id="guild-container">
          {#each guilds as guild}
            {#if guild.permission_level === 0}
              <Guild guild={guild}/>
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

<script>
    import axios from 'axios';
    import {fade} from 'svelte/transition';
    import {notifyError, withLoadingScreen} from '../js/util'
    import {setDefaultHeaders} from '../includes/Auth.svelte'
    import {API_URL} from "../js/constants.js";
    import Guild from '../components/Guild.svelte'
    import Card from '../components/Card.svelte'
    import InviteBadge from '../components/InviteBadge.svelte'
    import Button from '../components/Button.svelte'
    import Sidebar from '../includes/Sidebar.svelte'
    import {loadingScreen, permissionLevelCache, showSidebar} from "../js/stores";

    setDefaultHeaders();

    let guilds = window.localStorage.getItem('guilds') ? JSON.parse(window.localStorage.getItem('guilds')) : [];
    if(guilds.length > 0) {
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

            if (!res.data.success && res.data['reauthenticate_required'] === true) {
                window.location.href = "/login";
                return;
            }

            guilds = res.data.guilds;
            window.localStorage.setItem('guilds', JSON.stringify(guilds));
        });
    }

    function toggleBurger() {
        showSidebar.update(v => !v);
    }

    loadingScreen.set(false);
</script>

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
    }

    #refresh-container {
        display: flex;
        justify-content: center;

        margin: 10px 0;
        color: white;
    }

    .burger-menu-container {
        display: flex;
        align-items: center;
    }

    .burger-menu {
        display: none;
        background: none;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        font-size: 2rem;
        color: inherit;
    }

    .burger-menu:active {
        color: #333;
        background-color: white;
    }

    .burger-menu i {
        display: block;
        padding: 6px 8px;
    }

    @media (max-width: 950px) {
        .burger-menu {
            display: inline;
        }

        .card-wrapper {
            width: 100%;
        }
    }
</style>
