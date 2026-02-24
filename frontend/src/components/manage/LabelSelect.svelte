<script>
    import { createEventDispatcher } from "svelte";
    import { fly } from "svelte/transition";
    import LabelBadge from "./LabelBadge.svelte";

    const dispatch = createEventDispatcher();

    /** @type {Array<{label_id: number, name: string, colour: number}>} */
    export let labels = [];

    /** @type {number[]} selected label IDs */
    export let selected = [];

    let showDropdown = false;
    let searchValue = "";
    let container;

    $: available = labels.filter(
        (l) =>
            !searchValue ||
            l.name.toLowerCase().includes(searchValue.toLowerCase()),
    );

    $: selectedLabels = labels.filter((l) => selected.includes(l.label_id));

    function toggle(labelId) {
        if (selected.includes(labelId)) {
            selected = selected.filter((id) => id !== labelId);
        } else {
            selected = [...selected, labelId];
        }
        dispatch("change", selected);
    }

    function remove(labelId) {
        selected = selected.filter((id) => id !== labelId);
        dispatch("change", selected);
    }

    function handleClickOutside(e) {
        if (container && !container.contains(e.target)) {
            showDropdown = false;
            searchValue = "";
        }
    }

    function handleKeydown(e) {
        if (e.key === "Escape") {
            showDropdown = false;
            searchValue = "";
        }
    }

    function isSelected(labelId) {
        return selected.includes(labelId);
    }
</script>

<svelte:window on:click={handleClickOutside} on:keydown={handleKeydown} />

<div class="label-select" bind:this={container}>
    <div
        class="selected-area"
        on:click={() => {
            showDropdown = !showDropdown;
        }}
    >
        {#if selectedLabels.length > 0}
            <div class="selected-labels">
                {#each selectedLabels as label (label.label_id)}
                    <LabelBadge
                        name={label.name}
                        colour={label.colour}
                        removable
                        on:click={() => remove(label.label_id)}
                    />
                {/each}
            </div>
        {:else}
            <span class="placeholder">Select labels...</span>
        {/if}
        <svg
            class="dropdown-arrow"
            class:open={showDropdown}
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 18 18"
        >
            <path d="M5 8l4 4 4-4z"></path>
        </svg>
    </div>

    {#if showDropdown}
        <div class="dropdown" transition:fly={{ duration: 150, y: -4 }}>
            <div class="search-wrapper">
                <input
                    class="search"
                    type="text"
                    placeholder="Search labels..."
                    bind:value={searchValue}
                    autocomplete="off"
                />
            </div>
            <ul class="options">
                {#each available as label (label.label_id)}
                    <li
                        class:selected={isSelected(label.label_id)}
                        on:click|stopPropagation={() => toggle(label.label_id)}
                    >
                        <LabelBadge name={label.name} colour={label.colour} />
                        {#if isSelected(label.label_id)}
                            <i class="fas fa-check check-icon"></i>
                        {/if}
                    </li>
                {:else}
                    <li class="no-results">No labels found</li>
                {/each}
            </ul>
        </div>
    {/if}
</div>

<style>
    .label-select {
        position: relative;
        width: 100%;
    }

    .selected-area {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 44px;
        padding: 6px 12px;
        background: var(--background-tertiary, #252a3c);
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
        border-radius: var(--border-radius-sm, 6px);
        cursor: pointer;
        transition: border-color var(--transition-fast, 150ms);
    }

    .selected-area:hover {
        border-color: rgba(255, 255, 255, 0.15);
    }

    .selected-labels {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        flex: 1;
    }

    .placeholder {
        color: var(--text-secondary, rgba(255, 255, 255, 0.5));
        font-size: 14px;
    }

    .dropdown-arrow {
        flex-shrink: 0;
        margin-left: 8px;
        transition: transform var(--transition-fast, 150ms);
    }

    .dropdown-arrow.open {
        transform: rotate(180deg);
    }

    .dropdown-arrow path {
        fill: var(--text-secondary, rgba(255, 255, 255, 0.5));
    }

    .dropdown {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        width: 100%;
        background: var(--background-secondary, #1a1f2e);
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
        border-radius: var(--border-radius-sm, 6px);
        box-shadow: var(--shadow-lg, 0 8px 32px rgba(0, 0, 0, 0.3));
        z-index: 100;
        overflow: hidden;
    }

    .search-wrapper {
        padding: 8px;
        border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    }

    .search {
        width: 100%;
        padding: 8px 10px;
        background: var(--background-tertiary, #252a3c);
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
        border-radius: var(--border-radius-sm, 6px);
        color: var(--text-primary, #fff);
        font-size: 13px;
        outline: none;
    }

    .search:focus {
        border-color: var(--primary, #995df3);
    }

    .options {
        list-style: none;
        margin: 0;
        padding: 4px;
        max-height: 240px;
        overflow-y: auto;
    }

    li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-radius: 4px;
        cursor: pointer;
        transition: background var(--transition-fast, 150ms);
    }

    li:hover {
        background: var(--background-hover, #2a3042);
    }

    li.selected {
        background: color-mix(
            in srgb,
            var(--primary, #995df3) 15%,
            transparent
        );
    }

    li.no-results {
        color: var(--text-secondary, rgba(255, 255, 255, 0.5));
        cursor: default;
        justify-content: center;
        font-size: 13px;
    }

    li.no-results:hover {
        background: none;
    }

    .check-icon {
        color: var(--primary, #995df3);
        font-size: 12px;
    }
</style>
