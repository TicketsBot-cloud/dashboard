<div class="discord-select-menu {type} {disabled ? 'select-disabled' : ''}">
    <div class="select-placeholder">
        {placeholder || 'Select an option'}
        <i class="fas fa-chevron-down"></i>
    </div>

    {#if type == 'string-select' && options && options.length > 0}
        <div class="select-options">
            {#each options as option}
                <div class="select-option" data-value={option.value} data-id={custom_id}>
                    {#if option.emoji}
                        <span class="emoji">{option.emoji.name}</span>
                    {/if}
                    <span class="option-label">{option.label || ''}</span>
                </div>
                 {#if option.description}
                    <span class="option-description">{option.description}</span>
                {/if}
            {/each}
        </div>
    {/if}
</div>
<script>
    export let disabled = false;
    export let type = 'string-select';
    export let custom_id = '';
    export let placeholder = 'Select an option';
    export let options = [];
    export let emoji = null;
</script>
<style>
    

/* Select Menu (Types 3, 5, 6, 7, 8) */
.discord-select-menu {
    position: relative;
    background-color: var(--discord-dark-secondary);
    border-radius: 3px;
    min-height: 40px;
    min-width: 180px;
    width: 100%;
    cursor: pointer;
}

.select-placeholder {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    color: var(--discord-text-muted);
    font-size: 14px;
}

.select-placeholder i {
    margin-left: 8px;
}

.select-options {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background-color: var(--discord-dark-secondary);
    border-radius: 3px;
    margin-top: 4px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 10;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.discord-select-menu:hover .select-options {
    display: block;
}

.select-option {
    padding: 8px 16px;
    display: flex;
    align-items: center;
    transition: background-color 0.1s;
}

.select-option:hover {
    background-color: var(--discord-hover);
}

.option-label {
    flex: 1;
    font-size: 14px;
    color: var(--discord-text);
}

.option-description {
    font-size: 12px;
    color: var(--discord-text-muted);
    margin-left: 8px;
}

.select-disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
</style>