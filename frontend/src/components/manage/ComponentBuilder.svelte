<div style="display: flex; flex-direction: row; align-items: flex-end; gap: 8px; width: 100%; max-width: 400px;">
    <Dropdown
        col2
        label="Add Component"
        bind:value={addVal}
        style="flex: 1; background: #232323; color: #fff; font-size: 1.5rem; border-radius: 8px; padding: 16px;"
    >
        <option value={0} disabled selected>Select Component</option>
        <option value={1}>Action Row</option>
        <option value={9}>Section</option>
        <option value={10}>Text Display</option>
        <option value={12}>Media Gallery</option>
        <option value={14}>Separator</option>
    </Dropdown>
    <Button iconOnly icon="fa fa-plus" type="button" on:click={handleAddComponent} />
</div>
<script>
    import Dropdown from "../form/Dropdown.svelte";
    import Button from "../Button.svelte";
    import { createEventDispatcher } from "svelte";
    import { notifyError } from "../../js/util";
    let addVal = 0;

    export let componentArray = [];

    const dispatch = createEventDispatcher();

    // Function to handle adding components based on selected value
    function handleAddComponent() {
        let newComponent;
        switch(addVal) {
            case 1:
                newComponent = { type: 1, components: [] };
                break;
            case 9:
                newComponent = { type: 9, components: [], accessory: null };
                break;
            case 10:
                newComponent = { type: 10, content: '' };
                break;
            case 12:
                newComponent = { type: 12, items: [] };
                break;
            case 14:
                newComponent = { type: 14 };
                break;
            default:
                alert("Please select a valid component type to add.");
                return;
        }

        // componentArray = [...componentArray, newComponent];
        dispatch("add", newComponent);

        // Dispatch an event to update the array in the parent
        // dispatch('update', [...componentArray, newComponent]);

        addVal = 0;
        console.log("Component added:", newComponent);
    }
</script>