<script>
    import { onMount } from "svelte";
    import Button from "./Button.svelte";

    export let textComponents = [];
    export let accessory = null;
    onMount(() => {
       console.log("Section component mounted with textComponents:", textComponents);
    });
</script>
<div class="discord-section">
    <div class="discord-text">
        {#each textComponents.slice(0, 3) as textComp}
            <div class="discord-text-component">{@html textComp.content
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
                .replace(/^### (.*)$/gm, '<h3>$1</h3>') // Header 3
                .replace(/^## (.*)$/gm, '<h2>$1</h2>') // Header 2
                .replace(/^# (.*)$/gm, '<h1>$1</h1>') // Header 1
                .replace(/^\-# (.*)$/gm, '<span style="color: #b9bbbe; font-size: 10px; font-style: italic; margin-left: 2px;">$1</span>') // Subtext
                .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
                .replace(/__(.*?)__/g, '<u>$1</u>') // Underline
                .replace(/~~(.*?)~~/g, '<s>$1</s>') // Strikethrough
                .replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>') // Code block
                .replace(/`(.*?)`/g, '<code>$1</code>') // Inline code
                .replace(/^>(.*?)($|\n)/gm, '<blockquote>$1</blockquote>$2') // Blockquote (only at line start)
                .replace(/\n/g, '<br>') || ''}</div>
        {/each}
    </div>
    <div class="discord-accessory">
        {#if accessory?.type === 11}
            <img src={accessory.media.url} alt="media" class="discord-media-gallery" />
        {:else if accessory?.type === 2}
            <Button button_style={accessory.style} custom_id={accessory.custom_id} emoji={accessory.emoji} label={accessory.label} url={accessory.url} />
        {/if}
    </div>
</div>

<style>
    .discord-section {
        display: flex;
        align-items: flex-start;
        background-color: rgba(0, 0, 0, 0.1);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 8px;
    }
    .discord-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .discord-text-component {
        color: #dcddde;
        font-size: 15px;
        background: none;
        padding: 0;
    }
    .discord-accessory {
        margin-left: 12px;
        display: flex;
        align-items: center;
    }
    .discord-media-gallery {
        max-width: 80px;
        max-height: 80px;
        border-radius: 6px;
    }
    .discord-button {
        background: #5865f2;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 6px 14px;
        cursor: pointer;
        font-size: 14px;
    }
</style>