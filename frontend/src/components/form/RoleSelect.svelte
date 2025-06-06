{#if label !== undefined}
  <label class="form-label" for={selectId}>{label}</label>
{/if}

<WrappedSelect {placeholder} optionIdentifier="id" items={roles} {disabled}
               bind:selectedValue={value} nameMapper={labelMapper} labelProperty="name" aria-labelledby={selectId} on:change />

<script>
    import {onMount} from 'svelte'
    import {setDefaultHeaders} from '../../includes/Auth.svelte'
    import WrappedSelect from "../WrappedSelect.svelte";
    import {labelHash} from "../../js/labelHash";

    export let label;
    export let placeholder = "Search...";
    export let roles = [];
    export let guildId;
    export let disabled = false;

    export let value;

    function labelMapper(role) {
        return role.name;
    }

    onMount(() => {
        setDefaultHeaders();
    })

    $: selectId = label !== undefined ? `roleselect-${labelHash(label)}` : undefined;
</script>
