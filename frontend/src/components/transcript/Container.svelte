<div class="component-container {component.spoiler ? 'spoiler' : ''}" style="border-left: 6px solid {component.accent_color || 'transparent'};">
    {#if component.components && component.components.length > 0}
        {#each component.components as subcomponent}
            {#if subcomponent.type == 1}
                <ActionRow components={subcomponent.components} />
            {:else if component.type == 2} <!-- Button -->
                <Button
                    button_style={5}
                    emoji={component.emoji}
                    label={component.label}
            />
            {:else if subcomponent.type == 9}
                <Section textComponents={subcomponent.components} accessory={subcomponent.accessory} />
            {:else if subcomponent.type == 10}
                <div class="discord-text-component">
                    {@html subcomponent.content
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
                    .replace(/^### (.*)$/gm, '<h3>$1</h3>') // Header 3
                    .replace(/^## (.*)$/gm, '<h2>$1</h2>') // Header 2
                    .replace(/^# (.*)$/gm, '<h1>$1</h1>') // Header 1
                    .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
                    .replace(/__(.*?)__/g, '<u>$1</u>') // Underline
                    .replace(/~~(.*?)~~/g, '<s>$1</s>') // Strikethrough
                    .replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>') // Code block
                    .replace(/`(.*?)`/g, '<code>$1</code>') // Inline code
                    .replace(/^>(.*?)($|\n)/gm, '<blockquote>$1</blockquote>$2') // Blockquote (only at line start)
                    .replace(/\n/g, '<br>') || ''}
                </div>
            {:else if subcomponent.type == 12}
                <MediaGallery items={subcomponent.items} />
            {:else if subcomponent.type == 13}
                <div class="discord-file-input">
                    <input type="file" disabled />
                </div>
            {:else if subcomponent.type == 14}
                <div class="discord-separator" />
            {:else}
                <div class="unknown-component">
                    Unknown Component Type: {subcomponent.type}
                </div>
            {/if}
        {/each}
    {/if}
</div>
<script>
    export let component = {};
    import ActionRow from "./ActionRow.svelte";
    import Button from "./Button.svelte";
    import MediaGallery from "./MediaGallery.svelte";
    import Section from "./Section.svelte";
    
    function getButtonStyle(style) {
        let buttonStyle = '';
        switch (style) {
            case 1: buttonStyle = "button-primary"; break;
            case 2: buttonStyle = "button-secondary"; break;
            case 3: buttonStyle = "button-success"; break;
            case 4: buttonStyle = "button-danger"; break;
            default: buttonStyle = "button-primary"; break;
        }

        return buttonStyle;
    }
</script>
<style>
    .discord-text-component {
        font-size: 14px;
        line-height: 1.4;
        color: var(--discord-text);
        background-color: rgba(0, 0, 0, 0.1);
        border-radius: 3px;
        padding: 8px 12px;
        margin: 4px 0;
        word-wrap: break-word;
        max-width: 520px;
    }
    
    .component-container {
        background-color: var(--discord-dark);
        border-radius: 4px;
        padding: 12px;
        margin: 4px 0;
        max-width: 520px;
        width: 100%;
    }

    .component-container.spoiler {
        filter: blur(4px);
    }

    .component-container.spoiler:hover {
        filter: none;
    }
    
    .discord-separator {
        height: 1px;
        width: 100%;
        background-color: rgba(79, 84, 92, 0.48);
        margin: 4px 0;
        max-width: 520px;
    }
    .unknown-component {
        border: 1px dashed var(--discord-text-muted);
        border-radius: 3px;
        padding: 8px;
        color: var(--discord-text-muted);
        font-size: 12px;
        font-style: italic;
        margin: 4px 0;
    }
</style>