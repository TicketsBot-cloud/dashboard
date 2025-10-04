<script>
    import PremiumBadge from "../PremiumBadge.svelte";
    import { labelHash } from "../../js/labelHash";

    export let value;
    export let label;
    export let disabled = false;
    export let premiumBadge = false;
    export let id = undefined; // Allow optional ID to be passed

    export let col1 = false;
    export let col2 = false;
    export let col3 = false;
    export let col4 = false;

    // Use provided id or generate one from label
    $: checkboxId = id || (label !== undefined ? `checkbox-${labelHash(label)}` : `checkbox-${Math.random().toString(36).substr(2, 9)}`);
</script>

<div
    class:col-1={col1}
    class:col-2={col2}
    class:col-3={col3}
    class:col-4={col4}
    class="checkbox-container"
>
    <div class="label-wrapper">
        <slot name="label">
            <span class="form-label">
                {label}
            </span>
        </slot>
        {#if premiumBadge}
            <div style="margin-bottom: 5px">
                <PremiumBadge />
            </div>
        {/if}
    </div>
    <label class="toggle-switch" for={checkboxId}>
        <input
            id={checkboxId}
            type="checkbox"
            bind:checked={value}
            on:change
            {disabled}
        />
        <span class="slider"></span>
    </label>
</div>

<style>
    .checkbox-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .label-wrapper {
        display: flex;
        flex-direction: row;
        gap: 4px;
        align-items: center;
    }

    /* Toggle Switch Styles */
    .toggle-switch {
        position: relative;
        display: inline-block;
        width: 56px;
        height: 28px;
        cursor: pointer;
    }

    .toggle-switch input {
        opacity: 0;
        width: 0;
        height: 0;
        position: absolute;
    }

    .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #262b3d;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border-radius: 28px;
        border: 2px solid var(--border-color);
    }

    .slider:before {
        position: absolute;
        content: "";
        height: 20px;
        width: 20px;
        left: 2px;
        bottom: 2px;
        background-color: white;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    input:checked + .slider {
        background-color: var(--primary);
        border-color: var(--primary);
    }

    input:checked + .slider:before {
        transform: translateX(28px);
    }

    input:disabled + .slider {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Hover state */
    .toggle-switch:hover input:not(:disabled) + .slider {
        border-color: var(--border-color-hover);
        box-shadow: 0 0 0 3px rgba(38, 43, 61, 0.1);
    }

    /* Focus state for accessibility */
    input:focus + .slider {
        box-shadow: 0 0 0 3px rgba(153, 93, 243, 0.2);
        outline: none;
    }
</style>
