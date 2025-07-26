<script>
    import {Navigate} from 'svelte-router-spa'
</script>

<div class="sidebar">
  <div class="sidebar-container" id="sidebar-nav">
    <div class="inner">
      <Navigate to="/admin/bot-staff" styles="sidebar-link">
        <div class="sidebar-element">
          <i class="fas fa-user-group"></i>
          <span class="sidebar-text">Bot Staff</span>
        </div>
      </Navigate>
    </div>
  </div>
  <div class="sidebar-container">
    <div class="sidebar-element">
      <Navigate to="/" styles="sidebar-link">
        <i class="fas fa-home"></i>
        <span class="sidebar-text">Home</span>
      </Navigate>
    </div>
  </div>
</div>

<style>
    .sidebar {
        display: flex;
        flex-direction: column;
        height: calc(100% - 30px);
        min-width: 260px;
        padding: 15px 0;
        background-color: #272727;
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
        padding: 5px 20px;
    }

    .sidebar-element:hover {
        background-color: #121212;
        transition: background-color 0.5s ease;
    }

    .sidebar-element i {
        width: 25px;
        text-align: center;
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

    @media (max-width: 950px) {
        .sidebar {
            flex-direction: row;
            width: 100%;

            height: unset;
            min-width: unset;

            overflow: visible !important;
        }

        .sidebar-container {
            margin-bottom: unset;
        }

        .inner {
            display: flex;
        }

        .sidebar-element {
            width: unset;
            padding: 15px;
        }
    }
</style>