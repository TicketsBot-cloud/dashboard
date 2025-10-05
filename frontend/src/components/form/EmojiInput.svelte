<script>
    export let value;
    export let label = undefined;
    export let placeholder = undefined;
    export let disabled = false;

    export let col1 = false;
    export let col2 = false;
    export let col3 = false;
    export let col4 = false;

    import EmojiSelector from "svelte-emoji-selector";
    import { labelHash } from "../../js/labelHash";

    function onUpdate(e) {
        value = e.detail;
    }

    $: emojiInputId =
        label !== undefined ? `emojiinput-${labelHash(label)}` : undefined;
</script>

<div
    class:col-1={col1}
    class:col-2={col2}
    class:col-3={col3}
    class:col-4={col4}
>
    {#if label !== undefined}
        <label for={emojiInputId} class="form-label">{label}</label>
    {/if}
    <div class="wrapper">
        <input
            id={emojiInputId}
            class="form-input"
            {placeholder}
            {disabled}
            bind:value
        />
        {#if !disabled}
            <div class="picker-wrapper">
                <EmojiSelector on:emoji={onUpdate} />
            </div>
        {/if}
    </div>
</div>

<style>
    input {
        width: 100%;
        border-top-right-radius: 0 !important;
        border-bottom-right-radius: 0 !important;
    }

    .wrapper {
        display: flex;
        flex-direction: row;
        width: 100%;
    }

    :global(.svelte-emoji-picker__trigger) {
        border-bottom-left-radius: 0;
        border-top-left-radius: 0;
        background-color: #262b3d;
        border-color: #2e3136 !important;
        border-left: none;
        color: white;
        z-index: 2;
        height: 100%;
    }

    :global(.svelte-emoji-picker__trigger:active) {
        background-color: #262b3d !important;
    }

    .picker-wrapper {
        max-height: 48px;
    }
</style>
