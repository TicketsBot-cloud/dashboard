<div class:col-1={col1} class:col-2={col2} class:col-3={col3} class:col-4={col4}>
  <label for={colourId} class="form-label">{label}</label>
  <input id={colourId} class="form-input" type="color" on:input on:change bind:value={value} {disabled}>
</div>

<style>
    input {
      width: 100%;
  }
</style>

<script>
    import {labelHash} from "../../js/labelHash";

    export let value;
    export let label;
    export let disabled = false;

    export let col1 = false;
    export let col2 = false;
    export let col3 = false;
    export let col4 = false;

    $: colourId = label !== undefined ? `colour-${labelHash(label)}` : undefined;
</script>
