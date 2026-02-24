<script>
    import Tooltip from "svelte-tooltip";
    import { labelHash } from "../../js/labelHash";

    export let value;
    export let label;
    export let min;
    export let max;

    export let tooltipText = undefined;
    export let tooltipLink = undefined;

    export let col1 = false;
    export let col2 = false;
    export let col3 = false;
    export let col4 = false;

    $: numberId =
        label !== undefined ? `number-${labelHash(label)}` : undefined;

    function validateMax() {
        if (value > max) {
            value = max;
        }
    }

    // If we validateMin on input, the user can never backspace to enter a number
    function validateMin() {
        if (value < min) {
            value = min;
        }
    }
</script>

<div
    class:col-1={col1}
    class:col-2={col2}
    class:col-3={col3}
    class:col-4={col4}
>
    <div class="label-wrapper" class:no-margin={tooltipText !== undefined}>
        <label for={numberId} class="form-label" style="margin-bottom: 0"
            >{label}</label
        >
        {#if tooltipText !== undefined}
            <div>
                <Tooltip tip={tooltipText} top color="#121212">
                    {#if tooltipLink !== undefined}
                        <a href={tooltipLink} target="_blank">
                            <i
                                class="fas fa-circle-info form-label tooltip-icon"
                            ></i>
                        </a>
                    {:else}
                        <i
                            class="fas fa-circle-info form-label tooltip-icon"
                        ></i>
                    {/if}
                </Tooltip>
            </div>
        {/if}
    </div>
    <input
        id={numberId}
        class="form-input"
        type="number"
        {min}
        {max}
        bind:value
        on:input={validateMax}
        on:change={validateMin}
    />
</div>

<style>
    input {
        width: 100%;
    }

    .label-wrapper {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 5px;
        margin-bottom: 5px;
    }

    .no-margin {
        margin-bottom: 0 !important;
    }

    .tooltip-icon {
        cursor: pointer;
    }

</style>
