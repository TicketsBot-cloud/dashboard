<div class="parent">
    <div class="content">
        <Card footer={false}>
            <span slot="title">#{transcriptData.channel_name} - View Transcript</span>
            <div slot="body" class="body-wrapper">
                <div class="section">
                    <div class="messages-container" id="messages-container">
                        <!-- Sample messages will be populated by JavaScript -->
                        {#if transcriptData?.messages != undefined }
                        {#each transcriptData.messages as message}
                            <div class="message" data-id={message.id}>
                                <div class="message-avatar">
                                    <img 
                                        src={message.author.avatar || `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5) + 1}.png`} 
                                        on:error={(e) => e.target.src = `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5) + 1}.png`}
                                        alt={message.author.name}
                                    />   
                                </div>
                                <div class="message-content">
                                    <div class="message-header">
                                        <span class="message-author">{message.author.name}</span>
                                        {#if message.author.bot}
                                            <span class="bot-tag">BOT</span>
                                        {/if}
                                        <span class="message-timestamp">{new Date(message.timestamp).toLocaleString()}</span>
                                    </div>
            
                                    {#if message.content && message.content.trim()}
                                        <div class="message-text">
                                            {message.content}
                                        </div>
                                    {/if}
            
                                    {#if message.attachments && message.attachments.length > 0}
                                        {#each message.attachments as attachment}
                                            {#if attachment.content_type && attachment.content_type.startsWith('image/')}
                                                <div class="message-attachment">
                                                    <img src={attachment.url} alt="Attachment" class="attachment-image">
                                                </div>
                                            {:else}
                                                <div class="message-attachment">
                                                    <a href={attachment.url} target="_blank">{attachment.filename || 'Attachment'}</a>
                                                </div>
                                            {/if}
                                        {/each}
                                    {/if}
            
                                    {#if message.embeds && message.embeds.length > 0}
                                        {#each message.embeds as embed}
                                            <div class="message-embed" style="border-left-color: ${(!embed.color && embed.color !== 0 ? '#5865F2' : `#${embed.color.toString(16).padStart(6, '0')}`)}">
                                                {#if embed.author}
                                                    <div class="embed-author">
                                                        {#if embed.author.icon_url}
                                                            <img src={embed.author.icon_url} alt="Author icon" class="embed-author-icon">
                                                        {/if}
                                                        {#if embed.author.name}
                                                            <span class="embed-author-name">{embed.author.name}</span>
                                                        {/if}
                                                    </div>
                                                {/if}
            
                                                {#if embed.thumbnail}
                                                    <div class="embed-thumbnail">
                                                        <img src={embed.thumbnail.url} alt="Embed Thumbnail" class="embed-thumbnail-image">
                                                    </div>
                                                {/if}
            
                                                {#if embed.title}
                                                    {#if embed.url}
                                                        <a href={embed.url} target="_blank" class="embed-link">{embed.title}</a>
                                                    {:else}
                                                        {embed.title}
                                                    {/if}
                                                {/if}
            
                                                {#if embed.description}
                                                    <div class="embed-description">
                                                        {@html embed.description
                                                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
                                                            .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
                                                            .replace(/__(.*?)__/g, '<u>$1</u>') // Underline
                                                            .replace(/~~(.*?)~~/g, '<s>$1</s>') // Strikethrough
                                                            .replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>') // Code block
                                                            .replace(/`(.*?)`/g, '<code>$1</code>') // Inline code
                                                            .replace(/^>(.*?)($|\n)/gm, '<blockquote>$1</blockquote>$2') // Blockquote (only at line start)
                                                            .replace(/\n/g, '<br>')}
                                                    </div>
                                                {/if}
                                                
                                                {#if embed.fields && embed.fields.length > 0}
                                                    <div class="embed-fields">
                                                        {#each embed.fields as field}
                                                            <div class="embed-field {field.inline ? 'inline' : 'full-width'}">
                                                                <span class="embed-field-name">{field.name}</span>
                                                                <span class="embed-field-value">{field.value}</span>
                                                            </div>
                                                        {/each}
                                                    </div>
                                                {/if}
            
                                                {#if embed.image}
                                                    <div class="embed-image">
                                                        <img src={embed.image.url} alt="Embed Image">
                                                    </div>
                                                {/if}
            
                                                {#if embed.footer || embed.timestamp}
                                                    <div class="embed-footer">
                                                        {#if embed.footer?.icon_url}
                                                            <img src={embed.footer.icon_url} alt="Footer icon" class="embed-footer-icon">
                                                        {/if}
                                                        <span>
                                                            {embed.footer?.text || ''}
                                                            {embed.footer?.text && embed.timestamp ? ' • ' : ''}
                                                            {embed.timestamp ? embed.timestamp : ''}
                                                        </span>
                                                    </div>
                                                {/if}
                                            </div>
                                        {/each}
                                    {/if}
            
                                    {#if message.components && message.components.length > 0}
                                        <div class="message-components">
                                            {#each message.components as component}
                                                {#if component.type == 1} <!-- Action Row -->
                                                    <ActionRow components={component.components} />
                                                {:else if component.type == 2} <!-- Button -->
                                                    <Button 
                                                        button_style={getButtonStyle(component.style)}
                                                        custom_id={component.custom_id}
                                                        emoji={component.emoji}
                                                        label={component.label}
                                                    />
                                                {:else if component.type == 3} <!-- String Select -->
                                                    <SelectMenu
                                                        type="string-select"
                                                        custom_id={component.custom_id}
                                                        placeholder={component.placeholder}
                                                        options={component.options}
                                                        emoji={component.emoji}
                                                    />
                                                {:else if component.type == 5} <!-- User Select -->
                                                    <SelectMenu
                                                        type="user-select"
                                                        custom_id={component.custom_id}
                                                        placeholder={component.placeholder}
                                                        options={component.options}
                                                        emoji={component.emoji}
                                                    />
                                                {:else if component.type == 6} <!-- Role Select -->
                                                    <SelectMenu
                                                        type="role-select"
                                                        custom_id={component.custom_id}
                                                        placeholder={component.placeholder}
                                                        options={component.options}
                                                        emoji={component.emoji}
                                                    />
                                                {:else if component.type == 7} <!-- Mentionable Select -->
                                                    <SelectMenu
                                                        type="mentionable-select"
                                                        custom_id={component.custom_id}
                                                        placeholder={component.placeholder}
                                                        options={component.options}
                                                        emoji={component.emoji}
                                                    />
                                                {:else if component.type == 8} <!-- Channel Select -->
                                                    <SelectMenu
                                                        type="channel-select"
                                                        custom_id={component.custom_id}
                                                        placeholder={component.placeholder}
                                                        options={component.options}
                                                        emoji={component.emoji}
                                                    />
                                                {:else if component.type == 10}
                                                    <div class="discord-text-component">
                                                        {component.content || ''}
                                                    </div>
                                                {:else if component.type == 12} <!-- Media Gallery -->
                                                    <MediaGallery items={component.items} />
                                                {:else if component.type == 13} <!-- File Input -->
                                                    <div class="discord-file-input">
                                                        <input type="file" disabled />
                                                    </div>
                                                {:else if component.type == 14} <!-- Separator -->
                                                    <div class="discord-separator" />
                                                {:else if component.type == 17}
                                                    <div class="component-container {component.spoiler ? 'spoiler' : ''}">
                                                        {#if component.components && component.components.length > 0}
                                                            {#each component.components as subcomponent}
                                                                {#if subcomponent.type == 1}
                                                                    <ActionRow components={subcomponent.components} />
                                                                {:else if subcomponent.type == 10}
                                                                    <div class="discord-text-component">
                                                                        {subcomponent.content || ''}
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
                                                {:else} <!-- Unknown Component -->
                                                    <div class="unknown-component">
                                                        Unknown Component Type: {component.type}
                                                    </div>
                                                {/if}
            
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                        {:else}
                            <p>No messages found.</p>
                        {/if}
                    </div>
                </div>
            </div>
        </Card>
    </div>
</div>
<div id="media-modal" class="media-modal">
    <span class="media-modal-close">&times;</span>
    <img class="media-modal-content" id="modal-img" alt="Media preview">
</div>

<script>
    import axios from "axios";
    import {setDefaultHeaders} from '../includes/Auth.svelte'
    import {errorPage, withLoadingScreen} from '../js/util'
    import {API_URL} from "../js/constants";

    import Button from '../components/transcript/Button.svelte';
    import MediaGallery from "../components/transcript/MediaGallery.svelte";
    import ActionRow from "../components/transcript/ActionRow.svelte";
    import SelectMenu from "../components/transcript/SelectMenu.svelte";
    import Card from "../components/Card.svelte";

    export let currentRoute;
    export let params = {};

    let transcriptData = {};

    let guildId = currentRoute.namedParams.id;
    let ticketId = currentRoute.namedParams.ticketid;

    setDefaultHeaders();

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

    async function loadData() {
        const res = await axios.get(`${API_URL}/api/${guildId}/transcripts/${ticketId}/render`);
        if (res.status !== 200) {
            errorPage(res.data.error);
            return;
        }

        transcriptData = res.data;
        const msgs = transcriptData.messages.map(msg => {
            const userInfo = transcriptData.entities.users[msg.author] || {
                username: "Unknown User",
                avatar: `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5) + 1}.png`,
                badge: ""
            };

            return {
                id: msg.id,
                author: {
                    name: userInfo.username,
                    avatar: userInfo.avatar || `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5) + 1}.png`,
                    bot: userInfo.badge === "bot"
                },
                content: msg.content || "",
                timestamp: msg.time,
                embeds: msg.embeds || [],
                attachments: msg.attachments || [],
                components: msg.components || []
            };
        });

        transcriptData.messages = msgs;
    }

    loadData();

    // withLoadingScreen(loadData);
</script>


<style>
    /* Discord Theme CSS */
:root {
    /* Discord Colors */
    --discord-dark: #202225;
    --discord-dark-secondary: #2f3136;
    --discord-dark-tertiary: #36393f;
    --discord-light: #ffffff;
    --discord-text: #dcddde;
    --discord-text-muted: #72767d;
    --discord-link: #00b0f4;
    --discord-button: #5865f2;
    --discord-green: #3ba55c;
    --discord-yellow: #faa61a;
    --discord-red: #ed4245;
    --discord-channel: #8e9297;
    --discord-category: #8e9297;
    --discord-selected: #4f545c;
    --discord-hover: rgba(79, 84, 92, 0.16);
    --discord-divider: rgba(79, 84, 92, 0.48);
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: 'Open Sans', sans-serif;
}

.discord-theme {
    background-color: var(--discord-dark-tertiary);
    color: var(--discord-text);
}

.discord-container {
    display: flex;
    height: 100vh;
}

/* Server Sidebar */
.server-sidebar {
    width: 72px;
    height: 100%;
    background-color: var(--discord-dark);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 0;
    overflow-y: auto;
}

.server-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background-color: var(--discord-dark-secondary);
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 8px;
    cursor: pointer;
    transition: border-radius 0.15s ease-out, background-color 0.15s ease-out;
    color: var(--discord-text);
    font-size: 20px;
}

.server-icon:hover {
    background-color: var(--discord-button);
    border-radius: 16px;
}

.server-icon.active {
    background-color: var(--discord-button);
    border-radius: 16px;
}

.server-divider {
    width: 32px;
    height: 2px;
    background-color: var(--discord-divider);
    margin: 8px 0;
}

.add-server {
    background-color: var(--discord-dark-secondary);
    color: var(--discord-green);
}

.add-server:hover {
    background-color: var(--discord-green);
    color: white;
}

/* Channel Sidebar */
.channel-sidebar {
    width: 240px;
    height: 100%;
    background-color: var(--discord-dark-secondary);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.server-header {
    height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--discord-text);
    border-bottom: 1px solid var(--discord-dark);
    cursor: pointer;
}

.channel-container {
    flex-grow: 1;
    padding: 16px 8px;
    overflow-y: auto;
}

.channel-category {
    margin-bottom: 16px;
}

.category-header {
    display: flex;
    align-items: center;
    color: var(--discord-category);
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 4px;
    padding: 0 8px;
    cursor: pointer;
}

.category-header i {
    margin-right: 4px;
    font-size: 10px;
}

.channel {
    display: flex;
    align-items: center;
    padding: 6px 8px;
    border-radius: 4px;
    margin-bottom: 2px;
    color: var(--discord-channel);
    cursor: pointer;
}

.channel:hover {
    background-color: var(--discord-hover);
    color: var(--discord-text);
}

.channel.active {
    background-color: var(--discord-selected);
    color: var(--discord-text);
}

.channel i {
    margin-right: 6px;
    font-size: 14px;
}

/* User Controls */
.user-controls {
    height: 52px;
    padding: 0 8px;
    background-color: rgba(32, 34, 37, 0.3);
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.user-info {
    display: flex;
    align-items: center;
}

.user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    overflow: hidden;
    margin-right: 8px;
}

.user-name {
    font-size: 14px;
    font-weight: 600;
}

.user-tag {
    font-weight: 400;
    color: var(--discord-text-muted);
}

.user-actions {
    display: flex;
    align-items: center;
}

/* Chat Area */
.chat-area {
    flex-grow: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.chat-header {
    height: 48px;
    padding: 0 16px;
    border-bottom: 1px solid var(--discord-dark);
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.chat-header-left {
    display: flex;
    align-items: center;
}

.chat-header-left i {
    margin-right: 6px;
    color: var(--discord-text-muted);
}

.chat-header-right {
    display: flex;
    align-items: center;
}
/* Messages Container */
.messages-container {
    flex-grow: 1;
    padding: 16px;
    padding-bottom: 24px;
    overflow-y: auto;
}

.message {
    display: flex;
    margin-bottom: 16px;
}

.message-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    overflow: hidden;
    margin-right: 16px;
}

.message-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.message-content {
    flex-grow: 1;
}

.message-header {
    display: flex;
    align-items: baseline;
    margin-bottom: 4px;
}

.message-author {
    font-weight: 600;
    margin-right: 8px;
}

.message-timestamp {
    font-size: 12px;
    color: var(--discord-text-muted);
}

.message-text {
    font-size: 15px;
    line-height: 1.3;
    margin-bottom: 4px;
    white-space: pre-wrap;
    word-wrap: break-word;
}

.message-attachment {
    margin-top: 8px;
    max-width: 100%;
    border-radius: 4px;
    overflow: hidden;
}

.message-attachment img {
    max-width: 400px;
    max-height: 300px;
}

/* Bot Tag */
.bot-tag {
    background-color: var(--discord-button);
    color: white;
    font-size: 10px;
    font-weight: 500;
    padding: 1px 4px;
    border-radius: 3px;
    margin-left: 4px;
    text-transform: uppercase;
    display: inline-flex;
    align-items: center;
}

.member .bot-tag {
    font-size: 8px;
    padding: 0px 3px;
    margin-left: 6px;
    vertical-align: 1px;
}

/* Enhanced Embed Styles */
.message-embed {
    margin-top: 8px;
    border-left: 4px solid var(--discord-button);
    border-radius: 4px;
    background-color: var(--discord-dark-secondary);
    padding: 8px 12px;
    max-width: 520px;
}

.embed-title {
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--discord-link);
}

.embed-description {
    font-size: 14px;
    margin-bottom: 8px;
    color: var(--discord-text);
    line-height: 1.3;
}


.embed-author {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
}

.embed-author img {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    margin-right: 8px;
}

.embed-author-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--discord-text);
}

.embed-thumbnail {
    float: right;
    margin-left: 16px;
    margin-bottom: 8px;
    max-width: 80px;
    max-height: 80px;
    border-radius: 3px;
    overflow: hidden;
}

.embed-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.embed-image {
    margin-top: 8px;
    margin-bottom: 8px;
    max-width: 100%;
    border-radius: 3px;
    overflow: hidden;
}

.embed-image img {
    max-width: 100%;
    max-height: 300px;
}

.embed-fields {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 8px 0;
}

.embed-field {
    margin-bottom: 8px;
}

.embed-field.inline {
    grid-column: span 1;
}

.embed-field.full-width {
    grid-column: 1 / -1;
}

.embed-field-name {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 2px;
}

.embed-field-value {
    font-size: 14px;
    line-height: 1.3;
    word-wrap: break-word;
    white-space: pre-wrap;
}

.embed-footer {
    display: flex;
    align-items: center;
    font-size: 12px;
    color: var(--discord-text-muted);
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(79, 84, 92, 0.24);
}

.embed-footer img {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    margin-right: 8px;
}

/* Emojis and Mentions */
.emoji {
    width: 22px;
    height: 22px;
    vertical-align: middle;
    margin: 0 1px;
}

.mention {
    background-color: rgba(88, 101, 242, 0.3);
    color: var(--discord-button);
    border-radius: 3px;
    padding: 0 2px;
}

/* Member Sidebar */
.member-sidebar {
    width: 240px;
    height: 100%;
    background-color: var(--discord-dark-secondary);
    padding: 16px 8px;
    overflow-y: auto;
}

.member-group {
    margin-bottom: 24px;
}

.member-group h3 {
    color: var(--discord-text-muted);
    font-size: 12px;
    font-weight: 600;
    padding: 8px 8px 4px;
}

.member {
    display: flex;
    align-items: center;
    padding: 6px 8px;
    border-radius: 4px;
    margin-bottom: 2px;
    cursor: pointer;
}

.member:hover {
    background-color: var(--discord-hover);
}

.member-avatar {
    position: relative;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    overflow: hidden;
    margin-right: 12px;
}

.member-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.status {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--discord-dark-secondary);
}

.status.online {
    background-color: var(--discord-green);
}

.status.idle {
    background-color: var(--discord-yellow);
}

.status.dnd {
    background-color: var(--discord-red);
}

.status.offline {
    background-color: var(--discord-text-muted);
}

.member-name {
    font-size: 14px;
    font-weight: 500;
}

/* Custom scrollbar */
::-webkit-scrollbar {
    width: 8px;
}

::-webkit-scrollbar-track {
    background: transparent;
}

::-webkit-scrollbar-thumb {
    background: var(--discord-dark);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: #555;
}

/* Discord Components */
.message-components {
    margin-top: 8px;
    max-width: 520px;
}

/* Action Row */
.action-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
    max-width: 520px;
}

/* Separator */
.discord-separator {
    height: 1px;
    width: 100%;
    background-color: rgba(79, 84, 92, 0.48);
    margin: 4px 0;
    max-width: 520px;
}

.separator-thick {
    height: 2px;
}

.separator-thin {
    height: 1px;
    background-color: rgba(79, 84, 92, 0.24);
}

.separator-dashed {
    border-top: 1px dashed rgba(79, 84, 92, 0.48);
    background-color: transparent;
}

/* Text Component (Type 10) */
.discord-text-component {
    font-size: 14px;
    line-height: 1.4;
    color: var(--discord-text);
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 3px;
    padding: 8px 12px;
    margin: 4px 0;
    white-space: pre-wrap;
    word-wrap: break-word;
    max-width: 520px;
    width: 100%;
}

/* Text Input Form (Type 17) */
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

/* Text Input (Type 4) */
.discord-text-input {
    margin: 8px 0;
    width: 100%;
}

.input-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--discord-text);
    margin-bottom: 4px;
}

.input-wrapper {
    position: relative;
    border-radius: 3px;
    background-color: var(--discord-dark-secondary);
    border: 1px solid rgba(0, 0, 0, 0.3);
}

.input-wrapper input, 
.input-wrapper textarea {
    width: 100%;
    background: transparent;
    border: none;
    padding: 10px;
    color: var(--discord-text);
    font-size: 14px;
    outline: none;
    resize: none;
    cursor: not-allowed;
}

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

/* Unknown Components */
.unknown-component {
    border: 1px dashed var(--discord-text-muted);
    border-radius: 3px;
    padding: 8px;
    color: var(--discord-text-muted);
    font-size: 12px;
    font-style: italic;
    margin: 4px 0;
}

/* Media Gallery (Type 12) */
.discord-media-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
    margin: 8px 0;
    max-width: 100%;
}

/* Media Modal Styles */
.media-modal {
    display: none;
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgba(0, 0, 0, 0.8);
}

.media-modal-content {
    display: block;
    max-width: 90%;
    max-height: 90%;
    margin: 5% auto;
    border-radius: 4px;
    box-shadow: 0 0 20px rgba(0,0,0,0.5);
}

.media-modal-close {
    position: absolute;
    top: 20px;
    right: 35px;
    color: #f1f1f1;
    font-size: 40px;
    font-weight: bold;
    cursor: pointer;
    transition: color 0.2s;
}

.media-modal-close:hover,
.media-modal-close:focus {
    color: #bbb;
}
    .parent {
        display: flex;
        justify-content: center;
        width: 100%;
        height: 100%;
    }

    .content {
        display: flex;
        justify-content: space-between;
        width: 96%;
        height: 100%;
    }

    .body-wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        padding: 1%;
    }

    .section {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
    }

    .section:not(:first-child) {
        margin-top: 2%;
    }

    .section-title {
        font-size: 36px;
        font-weight: bolder !important;
    }

    h3 {
        font-size: 28px;
        margin-bottom: 4px;
    }

    .row {
        display: flex;
        flex-direction: row;
        width: 100%;
        height: 100%;
    }

    @media only screen and (max-width: 576px) {
        .row {
            flex-direction: column;
        }
    }
</style>
