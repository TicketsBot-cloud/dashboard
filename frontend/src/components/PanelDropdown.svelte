<label class="form-label">{label}</label>

<WrappedSelect placeholder="Select panel..." items={panels} optionIdentifier="panel_id" nameMapper={labelMapper}
               bind:selectedValue={selectedRaw} on:input={update} on:clear={handleClear} {isMulti} {isSearchable} />

<script>
    import {onMount} from "svelte";
    import WrappedSelect from "./WrappedSelect.svelte";

    export let label;
    export let panels;
    export let selected;
    export let isMulti = true;
    export let isSearchable = false;

    let selectedRaw = isMulti ? selected.map(panelId => panels.find(p => p.panel_id === panelId)).filter(p => p !== undefined) : selected;

    function labelMapper(panel) {
        return panel.title || "";
    }

    function update() {
        if (selectedRaw === undefined) {
            selectedRaw = [];
        }

        if (isMulti) {
            selected = selectedRaw.map((panel) => panel.panel_id);
        } else {
            if (selectedRaw) {
                selected = selectedRaw.panel_id;
            } else {
                selected = undefined;
            }
        }
    }

    function handleClear() {
        if (isMulti) {
            selected = [];
        } else {
            selected = undefined;
        }
    }

    function applyOverrides() {
        if (isMulti) {
            //selected = [];
            selectedRaw = selected.map(panelId => panels.find(p => p.panel_id === panelId)).filter(p => p !== undefined);
        } else {
            if (selectedRaw) {
                selectedRaw = selectedRaw.panel_id;
            }
        }
    }

    onMount(() => {
        applyOverrides();
    });
</script>