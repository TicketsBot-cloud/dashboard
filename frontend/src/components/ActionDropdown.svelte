<script>
    import { fade } from "svelte/transition";
    import { onMount, onDestroy } from "svelte";

    let isOpen = false;
    let dropdownRef;

    function toggleDropdown() {
        isOpen = !isOpen;
    }

    function handleClickOutside(event) {
        if (dropdownRef && !dropdownRef.contains(event.target)) {
            isOpen = false;
        }
    }

    function handleEscape(event) {
        if (event.key === "Escape") {
            isOpen = false;
        }
    }

    onMount(() => {
        document.addEventListener("click", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
    });

    onDestroy(() => {
        document.removeEventListener("click", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
    });

    export function close() {
        isOpen = false;
    }
</script>

<div class="action-dropdown" bind:this={dropdownRef}>
    <button
        class="action-trigger"
        on:click={toggleDropdown}
        aria-label="Actions"
    >
        <i class="fas fa-ellipsis-v"></i>
    </button>

    {#if isOpen}
        <div class="action-menu" transition:fade={{ duration: 150 }}>
            <slot />
        </div>
    {/if}
</div>

<style>
    .action-dropdown {
        position: relative;
        display: inline-block;
    }

    .action-trigger {
        background: transparent;
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-md);
        color: var(--text-secondary);
        padding: 8px 12px;
        cursor: pointer;
        transition: all var(--transition-fast);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
    }

    .action-trigger:hover {
        background: var(--background-hover);
        color: var(--text-primary);
        border-color: var(--border-color-hover);
    }

    .action-trigger:active {
        transform: scale(0.95);
    }

    .action-menu {
        position: absolute;
        right: 0;
        top: calc(100% + 8px);
        background: var(--background-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-md);
        box-shadow: var(--shadow-lg);
        min-width: 160px;
        z-index: 1000;
        overflow: hidden;
    }

    :global(.action-menu button) {
        width: 100%;
        text-align: left;
        padding: 10px 16px;
        background: transparent;
        border: none;
        border-radius: 0;
        color: var(--text-primary);
        font-size: 0.9rem;
        cursor: pointer;
        transition: all var(--transition-fast);
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 0;
        box-shadow: none;
    }

    :global(.action-menu button:hover) {
        background: var(--background-hover);
        transform: none;
        box-shadow: none;
    }

    :global(.action-menu button i) {
        width: 16px;
        text-align: center;
    }

    :global(.action-menu button.danger) {
        color: #e35d6a;
    }

    :global(.action-menu button.danger:hover) {
        background: rgba(220, 53, 69, 0.1);
    }

    :global(.action-menu .divider) {
        height: 1px;
        background: var(--border-color);
        margin: 4px 0;
    }
</style>
