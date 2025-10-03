<script>
    import Badge from "./Badge.svelte";
</script>

<Badge>
    <div class="inner">
        <i class="fas fa-gem"></i>
        <span>Premium</span>
    </div>
</Badge>

<style>
    .inner {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 4px;
        padding: 2px;
    }
</style>
