<script>
    export let title = "Beta Feature";
    export let message = "This feature is currently in beta and functionality may change in future updates.";
    export let icon = "fas fa-flask";
    export let color = "#7b61ff"; // Default purple color
    export let animate = true;
    export let compact = false;
</script>

<div class="beta-alert" class:compact class:animated={animate} style="--alert-color: {color}">
    <div class="beta-alert-icon">
        <i class={icon}></i>
    </div>
    <div class="beta-alert-content">
        <strong>{title}</strong>
        {#if !compact}
            <p>{message}</p>
        {/if}
    </div>
    {#if $$slots.default}
        <div class="beta-alert-extra">
            <slot />
        </div>
    {/if}
</div>

<style>
    .beta-alert {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 16px;
        margin: 10px 0;
        background: linear-gradient(
            135deg, 
            color-mix(in srgb, var(--alert-color) 10%, transparent) 0%, 
            color-mix(in srgb, var(--alert-color) 5%, transparent) 100%
        );
        border: 1px solid color-mix(in srgb, var(--alert-color) 30%, transparent);
        border-radius: 8px;
        transition: all 0.3s ease;
    }
    
    .beta-alert.compact {
        padding: 8px 12px;
        margin: 5px 0;
    }
    
    .beta-alert.animated {
        animation: subtle-pulse 3s ease-in-out infinite;
    }
    
    @keyframes subtle-pulse {
        0%, 100% {
            border-color: color-mix(in srgb, var(--alert-color) 30%, transparent);
        }
        50% {
            border-color: color-mix(in srgb, var(--alert-color) 50%, transparent);
        }
    }
    
    .beta-alert-icon {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--alert-color) 20%, transparent);
        border-radius: 50%;
        color: var(--alert-color);
    }
    
    .compact .beta-alert-icon {
        width: 20px;
        height: 20px;
    }
    
    .beta-alert-icon i {
        font-size: 12px;
    }
    
    .compact .beta-alert-icon i {
        font-size: 10px;
    }
    
    .beta-alert-content {
        flex: 1;
    }
    
    .beta-alert-content strong {
        display: block;
        color: var(--alert-color);
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 4px;
    }
    
    .compact .beta-alert-content strong {
        font-size: 13px;
        margin-bottom: 0;
    }
    
    .beta-alert-content p {
        margin: 0;
        color: var(--text-secondary, #666);
        font-size: 13px;
        line-height: 1.4;
    }
    
    .beta-alert-extra {
        flex-shrink: 0;
    }
    
    /* Hover effect */
    .beta-alert:hover {
        border-color: color-mix(in srgb, var(--alert-color) 40%, transparent);
        background: linear-gradient(
            135deg, 
            color-mix(in srgb, var(--alert-color) 12%, transparent) 0%, 
            color-mix(in srgb, var(--alert-color) 6%, transparent) 100%
        );
    }
    
    /* Different color presets via CSS variables */
    .beta-alert[style*="--alert-color: #ff6b6b"] .beta-alert-icon { /* Red/Danger */
        background: color-mix(in srgb, #ff6b6b 20%, transparent);
    }
    
    .beta-alert[style*="--alert-color: #51cf66"] .beta-alert-icon { /* Green/Success */
        background: color-mix(in srgb, #51cf66 20%, transparent);
    }
    
    .beta-alert[style*="--alert-color: #ffd43b"] .beta-alert-icon { /* Yellow/Warning */
        background: color-mix(in srgb, #ffd43b 20%, transparent);
    }
    
    .beta-alert[style*="--alert-color: #339af0"] .beta-alert-icon { /* Blue/Info */
        background: color-mix(in srgb, #339af0 20%, transparent);
    }
    
    /* Responsive design */
    @media (max-width: 480px) {
        .beta-alert {
            padding: 10px 12px;
            gap: 10px;
        }
        
        .beta-alert-content strong {
            font-size: 13px;
        }
        
        .beta-alert-content p {
            font-size: 12px;
        }
    }
</style>