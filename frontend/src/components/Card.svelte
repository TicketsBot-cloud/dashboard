<script>
    export let footer = true;
    export let fill = true;
    export let footerRight = false;
    export let dropdown = false;
    export let ref = undefined;

    let dropdownActive = false;
</script>

<div class="card" class:fill>
    <div
        class="card-header"
        class:dropdown
        on:click={() => (dropdownActive = dropdown && !dropdownActive)}
    >
        <div class="card-title-row">
            <h4 class="card-title">
                <slot name="title">No Title :(</slot>
            </h4>
            <slot name="title-items"></slot>
        </div>
    </div>
    <div
        class="card-body"
        class:dropdown
        class:dropdownActive
        class:dropdownInactive={dropdown && !dropdownActive}
        {ref}
    >
        <div class="inner" class:dropdown>
            <slot name="body">No Content :(</slot>
        </div>
    </div>

    {#if footer}
        <div class="card-footer">
            <div class="footer-content" class:footerRight>
                <slot name="footer" />
            </div>
        </div>
    {/if}
</div>

<style>
    .card {
        display: flex;
        flex-direction: column;

        background-color: var(--background-secondary) !important;
        border: 1px solid var(--border-color);

        width: 100%;
        border-radius: var(--border-radius-lg);
        box-shadow: var(--shadow-md);
        transition: all var(--transition-base);
    }

    .card:hover {
        box-shadow: var(--shadow-lg);
        border-color: var(--border-color-hover);
    }

    .fill {
        height: 100%;
    }

    .card-title {
        color: var(--text-primary);
        font-size: 1.375rem;
        font-weight: 500;
        letter-spacing: -0.01em;
    }

    .card-title-row {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 24px;
        margin: 0;
    }

    .card-header {
        display: flex;
        border-bottom: 1px solid var(--border-color);
    }

    .card-header.dropdown {
        cursor: pointer;
        user-select: none;
    }

    .card-body {
        display: flex;
        flex: 1;

        color: var(--text-primary);
        margin: 16px 24px;
    }

    .inner {
        display: flex;
        height: 100%;
        width: 100%;
    }

    .inner.dropdown {
        position: absolute;
    }

    .card-body.dropdown {
        position: relative;
        transition:
            min-height 0.3s ease-in-out,
            margin-top 0.3s ease-in-out,
            margin-bottom 0.3s ease-in-out;
    }

    .card-body.dropdownInactive {
        height: 0;
        visibility: hidden;

        margin: 0;
        flex: unset;
        min-height: 0 !important;
    }

    .card-body.dropdownActive {
        visibility: visible;
        min-height: auto;
        overflow: hidden;
    }

    .card-footer {
        display: flex;
        color: var(--text-primary);
        border-top: 1px solid var(--border-color);
        padding: 16px 24px;
    }

    .footer-content {
        display: flex;
        align-items: center;
        height: 100%;
        width: 100%;
    }

    .footerRight {
        flex-direction: row-reverse;
    }

    :global(div [slot="footer"]) {
        display: flex;
        flex-direction: row;
    }

    .inner > * {
        width: 100%;
    }
</style>
