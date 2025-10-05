<script>
    export let colour = "";
</script>

<div class="badge" style="--badge-background-color: {colour}">
    <slot></slot>
</div>

<style>
    .badge {
        display: flex;
        align-items: center;

        background: var(--badge-background-color, var(--primary));
        border-radius: var(--border-radius-md);
        font-size: 14px;
        padding: 0 4px;
    }
</style>
