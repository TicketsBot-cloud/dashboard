<script>
    import { fly } from 'svelte/transition';
    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher();

    /**
     * Generic searchable select component
     * Can be used for any list of options with search/filter
     * 
     * Options format:
     * [
     *   { label: 'Display Name', value: 'unique_id', disabled: false },
     *   { label: 'Another Option', value: 'another_id' },
     *   ...
     * ]
     */

    // Props
    export let value = '';
    export let label = '';
    export let options = []; // Array of { label, value, disabled? }
    export let placeholder = 'Search or select...';
    export let disabled = false;

    // State
    let searchInput = '';
    let showDropdown = false;
    let inputElement;
    let highlightedIndex = -1;

    // Computed - filter options and exclude disabled ones from filtering
    $: filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchInput.toLowerCase())
    );

    $: if (showDropdown && searchInput === '') {
        highlightedIndex = options.findIndex(opt => opt.value === value);
    }

    // Get the display text for the currently selected value
    $: selectedLabel = options.find(opt => opt.value === value)?.label || '';

    function handleInputChange() {
        showDropdown = true;
        highlightedIndex = -1;
    }

    function selectOption(opt) {
         // Don't allow selecting disabled options
         if (opt.disabled) return;
         
         value = opt.value;
         searchInput = '';
         showDropdown = false;
         highlightedIndex = -1;
         dispatch('change', { value: opt.value });
     }

    function getDisplayText(opt) {
        return opt.label;
    }

    function isOptionDisabled(opt) {
        return opt.disabled === true;
    }

    function handleKeyDown(e) {
        if (!showDropdown && (e.key === 'Enter' || e.key === ' ')) {
            showDropdown = true;
            e.preventDefault();
            return;
        }

        if (!showDropdown) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                // Move to next non-disabled option
                let nextIndex = highlightedIndex + 1;
                while (nextIndex < filteredOptions.length && isOptionDisabled(filteredOptions[nextIndex])) {
                    nextIndex++;
                }
                if (nextIndex < filteredOptions.length) {
                    highlightedIndex = nextIndex;
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                // Move to previous non-disabled option
                let prevIndex = highlightedIndex - 1;
                while (prevIndex >= 0 && isOptionDisabled(filteredOptions[prevIndex])) {
                    prevIndex--;
                }
                if (prevIndex >= 0) {
                    highlightedIndex = prevIndex;
                }
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && !isOptionDisabled(filteredOptions[highlightedIndex])) {
                    selectOption(filteredOptions[highlightedIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                showDropdown = false;
                searchInput = '';
                highlightedIndex = -1;
                break;
        }
    }

    function handleBlur() {
        setTimeout(() => {
            if (searchInput === '') {
                showDropdown = false;
            }
        }, 100);
    }

    function handleFocus() {
        if (!disabled) {
            showDropdown = true;
        }
    }

    function clearSearch() {
        searchInput = '';
        inputElement?.focus();
    }
</script>

<div class="search-select-container" class:disabled>
    {#if label}
        <label for="search-select-input" class="form-label">{label}</label>
    {/if}

    <div class="input-wrapper">
        <input
            bind:this={inputElement}
            value={searchInput || selectedLabel}
            id="search-select-input"
            type="text"
            placeholder={placeholder}
            class="search-input"
            class:has-value={searchInput === '' && selectedLabel}
            on:input={(e) => {
                searchInput = e.target.value;
                handleInputChange();
            }}
            on:keydown={handleKeyDown}
            on:focus={handleFocus}
            on:blur={handleBlur}
            autocomplete="off"
            {disabled}
        />

        {#if searchInput && !disabled}
            <button
                class="clear-button"
                on:click={clearSearch}
                title="Clear search"
                tabindex="-1"
            >
                <i class="fas fa-times"></i>
            </button>
        {/if}

        {#if !disabled}
            <div class="dropdown-arrow">
                {#if showDropdown}
                    <i class="fas fa-chevron-up"></i>
                {:else}
                    <i class="fas fa-chevron-down"></i>
                {/if}
            </div>
        {/if}
    </div>

    {#if showDropdown && !disabled && filteredOptions.length > 0}
        <ul
            class="dropdown-list"
            transition:fly={{ duration: 150, y: -5 }}
            role="listbox"
        >
            {#each filteredOptions as opt, index}
                {@const displayText = getDisplayText(opt)}
                {@const optValue = opt.value}
                {@const isDisabled = isOptionDisabled(opt)}
                <li
                    class="dropdown-item"
                    class:highlighted={highlightedIndex === index && !isDisabled}
                    class:selected={optValue === value}
                    class:disabled={isDisabled}
                    on:click={() => selectOption(opt)}
                    on:keydown={(e) => {
                        if (e.key === 'Enter' && !isDisabled) selectOption(opt);
                    }}
                    role="option"
                    aria-selected={optValue === value}
                    aria-disabled={isDisabled}
                    tabindex="-1"
                >
                    {#if optValue === value}
                        <i class="fas fa-check"></i>
                    {/if}
                    <span class="option-text">{displayText}</span>
                    {#if isDisabled}
                        <span class="disabled-badge" title="This option is disabled">
                            <i class="fas fa-lock"></i>
                        </span>
                    {/if}
                </li>
            {/each}
        </ul>
    {:else if showDropdown && !disabled && filteredOptions.length === 0}
        <div class="no-results" transition:fly={{ duration: 150, y: -5 }}>
            No results found
        </div>
    {/if}

    <input type="hidden" name={label || 'search-select'} {value} />
</div>

<style>
    .search-select-container {
        position: relative;
        width: 100%;
    }

    .search-select-container.disabled {
        opacity: 0.6;
        pointer-events: none;
    }

    .form-label {
        display: block;
        font-size: 14px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
    }

    .input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
    }

    .search-input {
        width: 100%;
        padding: 10px 40px 10px 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.3);
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        font-family: inherit;
        transition: all 0.2s ease;
        box-sizing: border-box;
    }

    .search-input:hover:not(:disabled) {
        border-color: rgba(255, 255, 255, 0.2);
        background: rgba(0, 0, 0, 0.4);
    }

    .search-input:focus {
        outline: none;
        border-color: #995df3;
        background: rgba(0, 0, 0, 0.5);
        box-shadow: 0 0 0 3px rgba(153, 93, 243, 0.1);
    }

    .search-input:disabled {
        cursor: not-allowed;
        opacity: 0.6;
    }

    .search-input::placeholder {
        color: rgba(255, 255, 255, 0.4);
    }

    .search-input.has-value {
        color: rgba(255, 255, 255, 1);
    }

    .clear-button {
        position: absolute;
        right: 32px;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        padding: 4px 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s ease;
    }

    .clear-button:hover {
        color: rgba(255, 255, 255, 0.8);
    }

    .dropdown-arrow {
        position: absolute;
        right: 12px;
        color: rgba(255, 255, 255, 0.5);
        font-size: 12px;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .dropdown-list {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        list-style: none;
        margin: 0;
        padding: 4px;
        background: #2e3136;
        border: 1px solid rgba(153, 93, 243, 0.2);
        border-radius: 6px;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
        max-height: 300px;
        overflow-y: auto;
        z-index: 1000;
    }

    .dropdown-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.8);
        user-select: none;
    }

    .dropdown-item:hover {
        background: rgba(153, 93, 243, 0.1);
        color: rgba(255, 255, 255, 0.95);
    }

    .dropdown-item.highlighted {
        background: rgba(153, 93, 243, 0.15);
        color: rgba(255, 255, 255, 0.95);
    }

    .dropdown-item.selected {
        background: rgba(153, 93, 243, 0.2);
        color: #995df3;
        font-weight: 500;
    }

    .dropdown-item.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        color: rgba(255, 255, 255, 0.5);
    }

    .dropdown-item.disabled:hover {
        background: transparent;
        color: rgba(255, 255, 255, 0.5);
    }

    .dropdown-item i {
        width: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
    }

    .option-text {
        flex: 1;
    }

    .disabled-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
        margin-left: 8px;
    }

    .no-results {
        padding: 16px 12px;
        text-align: center;
        color: rgba(255, 255, 255, 0.5);
        font-size: 13px;
    }

    input[type='hidden'] {
        display: none;
    }

    /* Scrollbar styling */
    .dropdown-list::-webkit-scrollbar {
        width: 6px;
    }

    .dropdown-list::-webkit-scrollbar-track {
        background: transparent;
    }

    .dropdown-list::-webkit-scrollbar-thumb {
        background: rgba(153, 93, 243, 0.3);
        border-radius: 3px;
    }

    .dropdown-list::-webkit-scrollbar-thumb:hover {
        background: rgba(153, 93, 243, 0.5);
    }
</style>
