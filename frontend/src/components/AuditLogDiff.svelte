<script>
    export let oldData = null;
    export let newData = null;

    let oldObj = {};
    let newObj = {};

    function safeParse(data) {
        if (!data) return {};
        try {
            const parsed = JSON.parse(data);
            if (parsed === null || parsed === undefined) return {};
            if (Array.isArray(parsed)) return { items: parsed };
            if (typeof parsed !== "object") return { value: parsed };
            return parsed;
        } catch {
            return {};
        }
    }

    $: oldObj = safeParse(oldData);
    $: newObj = safeParse(newData);

    // When both old and new exist, compare only shared keys to avoid
    // noise from mismatched struct types. When only one side exists,
    // show all keys from that side.
    $: hasBoth =
        Object.keys(oldObj).length > 0 && Object.keys(newObj).length > 0;
    $: allKeys = [
        ...new Set([...Object.keys(oldObj), ...Object.keys(newObj)]),
    ].sort();

    function formatValue(val) {
        if (val === null || val === undefined) return "null";
        if (typeof val === "object") return JSON.stringify(val, null, 2);
        return String(val);
    }

    function getChangeType(key) {
        const inOld = key in oldObj;
        const inNew = key in newObj;

        if (inOld && !inNew) return "removed";
        if (!inOld && inNew) return "added";

        const oldVal = JSON.stringify(oldObj[key]);
        const newVal = JSON.stringify(newObj[key]);
        if (oldVal !== newVal) return "changed";

        return "unchanged";
    }

    // When both old and new exist, only show keys in both that changed,
    // plus a summary of unique keys if any. When only one side exists,
    // show all keys.
    $: visibleKeys = hasBoth
        ? allKeys.filter((k) => getChangeType(k) === "changed")
        : allKeys.filter((k) => getChangeType(k) !== "unchanged");

    $: onlyOldKeys = hasBoth
        ? allKeys.filter((k) => k in oldObj && !(k in newObj))
        : [];
    $: onlyNewKeys = hasBoth
        ? allKeys.filter((k) => !(k in oldObj) && k in newObj)
        : [];
    $: hasUniqueKeys = onlyOldKeys.length > 0 || onlyNewKeys.length > 0;

    let showStructuralChanges = false;
</script>

{#if allKeys.length === 0}
    <div class="empty">No data available</div>
{:else}
    <div class="diff-container">
        {#each visibleKeys as key}
            {@const changeType = getChangeType(key)}
            <div class="diff-row {changeType}">
                <span class="diff-key">{key}</span>
                {#if changeType === "removed"}
                    <span class="diff-value removed-value"
                        >{formatValue(oldObj[key])}</span
                    >
                {:else if changeType === "added"}
                    <span class="diff-value added-value"
                        >{formatValue(newObj[key])}</span
                    >
                {:else}
                    <div class="diff-comparison-wrapper">
                        <div class="diff-comparison-column">
                            <span class="diff-value removed-value"
                                >{formatValue(oldObj[key])}</span
                            >
                        </div>
                        <span class="diff-arrow">-></span>
                        <div class="diff-comparison-column">
                            <span class="diff-value added-value"
                                >{formatValue(newObj[key])}</span
                            >
                        </div>
                    </div>
                {/if}
            </div>
        {/each}

        {#if visibleKeys.length === 0}
            <div class="empty">No changes detected</div>
        {/if}

        {#if hasBoth && hasUniqueKeys}
            <button
                class="toggle-structural"
                on:click={() =>
                    (showStructuralChanges = !showStructuralChanges)}
            >
                {showStructuralChanges ? "Hide" : "Show"} structural changes ({onlyOldKeys.length +
                    onlyNewKeys.length} fields)
            </button>
            {#if showStructuralChanges}
                {#each onlyOldKeys as key}
                    <div class="diff-row removed">
                        <span class="diff-key">{key}</span>
                        <span class="diff-value removed-value"
                            >{formatValue(oldObj[key])}</span
                        >
                    </div>
                {/each}
                {#each onlyNewKeys as key}
                    <div class="diff-row added">
                        <span class="diff-key">{key}</span>
                        <span class="diff-value added-value"
                            >{formatValue(newObj[key])}</span
                        >
                    </div>
                {/each}
            {/if}
        {/if}
    </div>
{/if}

<style>
    .diff-container {
        font-family: monospace;
        font-size: 13px;
        line-height: 1.6;
        overflow-x: auto;
        text-align: left !important;
    }

    .diff-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 4px 8px;
        border-radius: 4px;
        margin-bottom: 2px;
    }

    .diff-row.removed {
        background: rgba(227, 93, 106, 0.1);
    }

    .diff-row.added {
        background: rgba(40, 167, 69, 0.1);
    }

    .diff-row.changed {
        background: rgba(153, 93, 243, 0.1);
    }

    .diff-key {
        font-weight: 600;
        min-width: 120px;
        color: var(--text-primary);
    }

    .diff-value {
        word-break: break-all;
        white-space: pre-wrap;
    }

    .removed-value {
        color: #e35d6a;
    }

    .added-value {
        color: #28a745;
    }

    .diff-arrow {
        color: var(--text-secondary, #6c757d);
        flex-shrink: 0;
    }

    /* Desktop: hide headers and use inline layout */
    .diff-comparison-wrapper {
        display: contents;
    }

    .diff-comparison-column {
        display: contents;
    }

    .diff-comparison-header {
        display: none;
    }

    .empty {
        color: var(--text-secondary, #6c757d);
        font-style: italic;
        padding: 8px;
    }

    .toggle-structural {
        background: none;
        border: 1px solid var(--text-secondary, #6c757d);
        color: var(--text-secondary, #6c757d);
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        margin-top: 6px;
        margin-bottom: 4px;
    }

    .toggle-structural:hover {
        color: var(--text-primary);
        border-color: var(--text-primary);
    }

    @media only screen and (max-width: 768px) {
        .diff-key {
            min-width: unset;
            width: 100%;
            margin-bottom: 8px;
        }

        .diff-row {
            flex-direction: column;
            gap: 0;
        }

        .diff-row.changed {
            padding: 8px;
        }

        /* Hide arrow on mobile */
        .diff-arrow {
            display: none;
        }

        /* Show comparison wrapper as grid on mobile */
        .diff-comparison-wrapper {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            width: 100%;
        }

        .diff-comparison-column {
            display: flex;
            flex-direction: column;
            min-width: 0;
            gap: 4px;
        }

        /* Show headers on mobile */
        .diff-comparison-header {
            display: block;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .diff-value {
            font-size: 12px;
            word-break: break-word;
        }

        /* For removed/added rows (not changed), keep simple */
        .diff-row.removed,
        .diff-row.added {
            flex-direction: row;
            gap: 8px;
        }

        .diff-row.removed .diff-key,
        .diff-row.added .diff-key {
            width: auto;
            min-width: 80px;
            margin-bottom: 0;
        }
    }
</style>
