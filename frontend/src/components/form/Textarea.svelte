<div class:col-1={col1} class:col-2={col2} class:col-3={col3} class:col-4={col4} class:col-3-4={col3_4} style="--min-height: {minHeight}">
  <label for={textareaId} class="form-label">{label}</label>
  <textarea id={textareaId} class="form-input" placeholder="{placeholder}" bind:value on:change on:input></textarea>
</div>

<script>
    import {labelHash} from "../../js/labelHash";

    export let value;
    export let label;
    export let placeholder;

    export let col1 = false;
    export let col2 = false;
    export let col3 = false;
    export let col4 = false;

    export let col3_4 = false;

    export let minHeight = "100px";

    $: textareaId = label !== undefined ? `textarea-${labelHash(label)}` : undefined;
</script>

<style>
    textarea {
        width: 100%;
        min-height: var(--min-height);
    }
</style>