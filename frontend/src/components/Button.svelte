<script>
    export let icon = undefined;
    export let fullWidth = false;
    export let disabled = false;
    export let type = "submit";
    export let danger = false;
    export let iconOnly = false;
    export let noShadow = false;
    export let clientWidth;
</script>

<button
    on:click
    isTrigger="1"
    class:fullWidth
    class:danger
    class:iconOnly
    class:shadow={!noShadow}
    {disabled}
    {type}
    bind:clientWidth
>
    {#if icon !== undefined}
        <i class={icon}></i>
    {/if}
    {#if !iconOnly}
        <span class="content">
            <slot />
        </span>
    {/if}
</button>

<style>
    button {
        display: flex;

        justify-content: center;
        align-items: center;

        text-align: center;

        color: white;
        background: #995df3;
        border: none;
        border-radius: var(--border-radius-md);
        margin: 0;
        padding: 12px 24px;
        font-weight: 500;
        letter-spacing: 0.02em;

        cursor: pointer;
        transition: all var(--transition-fast);
        transform: translateY(0);
    }

    button.shadow {
        box-shadow: var(--shadow-md);
    }

    button:hover:enabled {
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg);
        background: #7a4ac2;
        background-color: #7a4ac2;
    }

    button:active:enabled {
        transform: translateY(0);
        box-shadow: var(--shadow-sm);
    }

    button:disabled {
        background: #6c757d;
        border: #6c757d;
        cursor: not-allowed;
    }

    .content {
        margin-left: 5px;
        margin-right: 5px;
    }

    .fullWidth {
        width: 100%;
    }

    .danger {
        background: #e35d6a !important;
        border-color: #e35d6a !important;
    }

    .danger:hover:enabled,
    .danger:active {
        background: #c32232 !important;
        border-color: #c32232 !important;
    }

    .iconOnly {
        width: 40px;
        height: 40px;
    }
</style>
