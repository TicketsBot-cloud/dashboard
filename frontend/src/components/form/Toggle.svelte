<div class:inline>
  {#if label !== undefined}
    <label class="form-label" style="margin-bottom: 0 !important;" for={labelId}>{label}</label>
  {/if}
  <Toggle hideLabel
          toggledColor="{toggledColour}"
          untoggledColor="{untoggledColour}"
          bind:toggled={value}
          aria-labelledby={labelId}
  />
</div>

<script>
    import Toggle from "svelte-toggle";
    import {labelHash} from "../../js/labelHash";

    export let value;
    export let label;

    export let toggledColour = "#66bb6a";
    export let untoggledColour = "#ccc";
    export let inline = false;

    $: labelId = label !== undefined ? `toggle-${labelHash(label)}` : undefined;
</script>

<style>
  div {
      display: flex;
      flex-direction: column;
  }

  .inline {
      flex-direction: row !important;
      gap: 4px;
  }
</style>