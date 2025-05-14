<div class="discord-button {convertButtonStyle(button_style)}" data-custom-id={custom_id || ''}>
    {#if emoji}
        <span class="emoji">{emoji.name}</span>
    {/if}
    {label || ''}
</div>

<script>
    export let button_style;
    export let custom_id;
    export let emoji;
    export let label;

    function convertButtonStyle(style) {
        switch (style) {
            case 1:
                return 'button-primary';
            case 2:
                return 'button-secondary';
            case 3:
                return 'button-success';
            case 4:
                return 'button-danger';
            case 5:
                return 'button-link';
            default:
                return '';
        }
    }
</script>
<style>
    
.discord-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 16px;
    min-width: 60px;
    min-height: 32px;
    border-radius: 3px;
    font-size: 14px;
    font-weight: 500;
    user-select: none;
    line-height: 16px;
    transition: background-color 0.17s ease, color 0.17s ease;
    cursor: pointer;
}

/* Button styles */
.button-primary {
    background-color: var(--discord-button);
    color: white;
}

.button-primary:hover {
    background-color: #4752c4;
}

.button-secondary {
    background-color: #4f545c;
    color: white;
}

.button-secondary:hover {
    background-color: #686d73;
}

.button-success {
    background-color: var(--discord-green);
    color: white;
}

.button-success:hover {
    background-color: #2d7d46;
}

.button-danger {
    background-color: var(--discord-red);
    color: white;
}

.button-danger:hover {
    background-color: #a12d2f;
}

.button-link {
    background-color: #4f545c;
    color: white;
    text-decoration: underline;
}

.button-link:hover {
    background-color: #686d73;
}

.button-disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.discord-button .emoji {
    width: 18px;
    height: 18px;
    margin-right: 8px;
    vertical-align: -4px;
}
</style>