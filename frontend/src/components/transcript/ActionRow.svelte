<div class="action-row">
    {#if components && components.length > 0}
        {#each components as component}
            {#if component.type == 2}
                <Button
                    button_style={component.style}
                    custom_id={component.custom_id}
                    emoji={component.emoji}
                    label={component.label}
                />
            {:else if component.type == 3}
                <SelectMenu
                    type="string-select"
                    custom_id={component.custom_id}
                    placeholder={component.placeholder}
                    options={component.options}
                    emoji={component.emoji}
                />
            {:else if component.type == 5}
                <SelectMenu
                    type="user-select"
                    custom_id={component.custom_id}
                    placeholder={component.placeholder}
                    options={component.options}
                    emoji={component.emoji}
                />
            {:else}
                <div class="unknown-component">
                    Unknown component type: {component.type}
                </div>
            {/if}
        {/each}
    {/if}
</div>
<script>
    import Button from "./Button.svelte";
    import SelectMenu from "./SelectMenu.svelte";

    export let components = [];
</script>
<style>
    
.action-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
    max-width: 520px;
}

</style>