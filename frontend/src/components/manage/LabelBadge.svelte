<script>
    import { intToColour } from "../../js/util";

    export let name;
    export let colour = 0;
    export let removable = false;

    $: colourHex = intToColour(colour);
    $: textColour = isLight(colour) ? "#000" : "#fff";

    function isLight(c) {
        const r = (c >> 16) & 0xff;
        const g = (c >> 8) & 0xff;
        const b = c & 0xff;
        return (r * 299 + g * 587 + b * 114) / 1000 > 128;
    }
</script>

<span
    class="label-badge"
    style="--label-colour: {colourHex}; --label-text: {textColour}"
>
    <span class="dot"></span>
    <span class="name">{name}</span>
    {#if removable}
        <button class="remove" on:click title="Remove label">
            <i class="fas fa-xmark"></i>
        </button>
    {/if}
</span>

<style>
    .label-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--label-colour) 20%, transparent);
        border: 1px solid
            color-mix(in srgb, var(--label-colour) 40%, transparent);
        font-size: 13px;
        font-weight: 500;
        line-height: 1;
        white-space: nowrap;
    }

    .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--label-colour);
        flex-shrink: 0;
    }

    .name {
        color: var(--text-primary, #fff);
    }

    .remove {
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        color: var(--text-secondary, rgba(255, 255, 255, 0.7));
        cursor: pointer;
        padding: 0;
        margin-left: 2px;
        font-size: 11px;
        transition: color var(--transition-fast, 150ms);
    }

    .remove:hover {
        color: var(--text-primary, #fff);
    }
</style>
