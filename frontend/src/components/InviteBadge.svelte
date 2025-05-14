<div class="guild-badge" on:click={invite}>
  <div class="guild-icon-bg">
    <i class="fas fa-plus fa-2x guild-icon-fa"></i>
  </div>

  <div style="padding-left: 10px">
    <span class="guild-name">Invite to your server</span>
  </div>
</div>

<script>
    import {INVITE_URL} from "../js/constants";
    function invite() {
        window.location.href = INVITE_URL;
    }
</script>
