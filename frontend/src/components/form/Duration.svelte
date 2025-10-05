<script>
    import { labelHash } from "../../js/labelHash";

    export let label;
    export let disabled = false; // note: bind:disabled isn't valid

    export let days = 0;
    export let hours = 0;
    export let minutes = 0;

    $: durationId =
        label !== undefined ? `duration-${labelHash(label)}` : undefined;
</script>

<div class="col">
    <div class="row label">
        {#if label}
            <div class="header">
                <label
                    class="form-label"
                    style="margin-bottom: unset"
                    for={durationId}>{label}</label
                >
                <slot name="header"></slot>
            </div>
        {/if}
    </div>

    <div class="row fields">
        <div class="parent">
            <input
                class="form-input"
                type="number"
                min="0"
                {disabled}
                bind:value={days}
                id={durationId ? `${durationId}-days` : undefined}
                aria-labelledby={durationId}
            />
            <div class="period" class:disabled>D</div>
        </div>

        <div class="parent">
            <input
                class="form-input"
                type="number"
                min="0"
                {disabled}
                bind:value={hours}
                id={durationId ? `${durationId}-hours` : undefined}
                aria-labelledby={durationId}
            />
            <div class="period" class:disabled>H</div>
        </div>

        <div class="parent">
            <input
                class="form-input"
                type="number"
                min="0"
                {disabled}
                bind:value={minutes}
                id={durationId ? `${durationId}-minutes` : undefined}
                aria-labelledby={durationId}
            />
            <div class="period" class:disabled>M</div>
        </div>
    </div>
</div>

<style>
    .col {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
    }

    .row {
        display: flex;
        flex-direction: row;
        width: 100%;
        height: 100%;
    }

    .fields > .parent:not(:first-child) {
        margin-left: 10px;
    }

    input {
        border-top-right-radius: 0 !important;
        border-bottom-right-radius: 0 !important;
        width: 100%;
        -moz-appearance: textfield;
    }

    input:disabled {
        opacity: 0.6;
    }

    .period.disabled {
        opacity: 0.6;
    }

    input::-webkit-outer-spin-button,
    input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    label {
        display: flex;
        align-items: center;
        margin: 0;
    }

    .label {
        margin-bottom: 4px;
    }

    .header {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 5px;
    }

    .parent {
        display: flex;
        flex-direction: row;
    }

    .period {
        display: flex;
        align-items: center;
        border-color: #262b3d !important;
        background-color: #262b3d !important;
        color: white !important;
        outline: none;
        border-top-right-radius: 4px;
        border-bottom-right-radius: 4px;
        padding: 0 10px;
        margin: 0 0 0.5em 0;
        height: 48px;
    }
</style>
