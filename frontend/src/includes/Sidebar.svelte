<script>
    import {Navigate} from 'svelte-router-spa'
    import {WHITELABEL_DISABLED} from "../js/constants";
    import {getAvatarUrl, getDefaultIcon} from "../js/icons";

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
      <Navigate to="/logout" onclick="clearLocalStorage();" styles="sidebar-link">
        <i class="sidebar-icon fas fa-sign-out-alt sidebar-icon"></i>
        <span class="sidebar-text">Logout</span>
      </Navigate>
    </div>
    <div class="sidebar-element user-element">
      <a class="sidebar-link">
        <img class="avatar" src={getAvatarUrl(userData.id, userData.avatar)}
          on:error={(e) => handleAvatarLoadError(e, userData.id)} alt="Avatar"/>

        <span class="sidebar-text">{userData.username}</span>
      </a>
    </div>
  </div>
</div>

<style>
    .sidebar {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 16.6%;
        background-color: #272727;
        float: left;
        background-size: cover;
        overflow-x: hidden !important;
        min-width: 250px;
    }

    .sidebar-container {
        margin-bottom: 2%;
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

    #custom-image {
        max-height: 70px;
        max-width: 90%;
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
    }

    .sidebar-text {
        margin-left: 4%;
        display: flex;
        align-items: center;
    }

    #sidebar-nav {
        display: flex;
        flex: 1;
    }

    .ref {
        display: flex;
        justify-content: center;
    }

    .ref-wrapper {
        display: flex;
        justify-content: center;
        padding: 10px 0;
        margin: 0 !important
    }

    .avatar {
        width: 32px;
        height: 32px;
        display: block;
        background-size: cover !important;
        border-radius: 50%;
    }

    @media (max-width: 950px) {
        .sidebar {
            flex-direction: row;
            width: 100%;

            height: unset;
            min-width: unset;

            overflow: visible !important;
        }

        .ref {
            display: none;
        }

        .sidebar-container {
            margin-bottom: unset;
        }

        .inner {
            display: flex;
        }

        .sidebar-element {
            width: unset;
            padding: 20px 15px;
        }

        :global(.sidebar-link) {
            width: unset;
        }

        .user-element {
            display: none;
        }
    }
</style>
