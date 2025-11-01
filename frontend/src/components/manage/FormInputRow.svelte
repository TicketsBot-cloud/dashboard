<script>
    import { createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher();

    import Input from "../form/Input.svelte";
    import Dropdown from "../form/Dropdown.svelte";
    import Button from "../Button.svelte";
    import Textarea from "../form/Textarea.svelte";
    import Checkbox from "../form/Checkbox.svelte";
    import DoubleRangeSlider from "../form/DoubleRangeSlider.svelte";

    export let withCreateButton = false;
    export let withDeleteButton = false;
    export let withDirectionButtons = false;
    export let disabled = false;

    export let index;
    export let formLength;
    export let formId;

    export let data = {};
    export let hasValidationErrors = false;

    // Initialize options if not present
    $: if (data.type === 3 && !data.options) {
        data.options = [];
    }

    // Validate min/max selections
    $: if (
        data.min_length &&
        data.max_length &&
        data.min_length > data.max_length
    ) {
        data.min_length = data.max_length;
    }

    // Ensure max selections doesn't exceed number of options
    $: if (
        data.options &&
        data.max_length &&
        data.max_length > data.options.length
    ) {
        data.max_length = data.options.length;
    }

    // Ensure min selections doesn't exceed number of options
    $: if (
        data.options &&
        data.min_length &&
        data.min_length > data.options.length
    ) {
        data.min_length = data.options.length;
    }

    // Clear selections if no options
    $: if (data.options && data.options.length === 0) {
        data.min_length = undefined;
        data.max_length = undefined;
    }

    // Check for duplicate option values
    $: duplicateValues = (() => {
        if (!data.options || data.type !== 3) return [];
        const valueMap = new Map();
        const duplicates = [];

        data.options.forEach((opt, index) => {
            if (opt.value && opt.value.trim()) {
                if (valueMap.has(opt.value)) {
                    if (!duplicates.includes(opt.value)) {
                        duplicates.push(opt.value);
                    }
                } else {
                    valueMap.set(opt.value, index);
                }
            }
        });

        return duplicates;
    })();

    // Flag for duplicate values
    $: hasDuplicateValues = duplicateValues.length > 0;

    // Check for no options in string select
    $: hasNoOptions = data.type === 3 && (!data.options || data.options.length === 0);

    // Validate label (required, max 45 chars)
    $: hasInvalidLabel = !data.label || data.label.trim().length === 0 || data.label.length > 45;

    // Validate description (max 100 chars)
    $: hasInvalidDescription = data.description && data.description.length > 100;

    // Overall validation error flag
    $: hasValidationErrors = hasDuplicateValues || hasNoOptions || hasInvalidLabel || hasInvalidDescription;

    $: windowWidth = 0;

    function forwardCreate() {
        dispatch("create", data);
    }

    function forwardDelete() {
        dispatch("delete", {});
    }

    function forwardMove(direction) {
        dispatch("move", { direction: direction });
    }

    function updateStyle(e) {
        const styleValue = parseInt(e.target.value, 10);
        data.style = styleValue;
        if (styleValue === 1) {
            // Short
            if (data.max_length > 255) {
                data.max_length = 255;
            }
        }
    }

    function addDropdownItem() {
        if (!data.options) {
            data.options = [];
        }
        if (data.options.length < 25) {
            data.options = [
                ...data.options,
                {
                    label: "",
                    value: "",
                    description: "",
                },
            ];
        }
    }

    function removeDropdownItem(index) {
        data.options = data.options.filter((_, i) => i !== index);

        // Adjust constraints if they exceed the new number of options
        if (data.options.length > 0) {
            if (data.min_length && data.min_length > data.options.length) {
                data.min_length = data.options.length;
            }
            if (data.max_length && data.max_length > data.options.length) {
                data.max_length = data.options.length;
            }
        } else {
            // Clear constraints if no options left
            data.min_length = undefined;
            data.max_length = undefined;
            data.allow_multiple = false;
        }
    }

    function updateDropdownItem(index, field, value) {
        data.options[index][field] = value;
        data.options = [...data.options];
    }
</script>

<form on:submit|preventDefault={forwardCreate} class="input-form">
    <div class="row">
        <div class="sub-row" style="flex: 1; margin-right: 10px;">
            <Input
                col1={true}
                label="Label"
                bind:value={data.label}
                placeholder="Name of the field"
            />
        </div>
        <div class="sub-row buttons-row">
            {#if windowWidth > 950}
                {#if withDirectionButtons}
                    <form
                        on:submit|preventDefault={() => forwardMove("down")}
                        class="button-form"
                    >
                        <Button disabled={index >= formLength - 1}>
                            <i class="fas fa-chevron-down"></i>
                        </Button>
                    </form>
                    <form
                        on:submit|preventDefault={() => forwardMove("up")}
                        class="button-form"
                    >
                        <Button disabled={index === 0}>
                            <i class="fas fa-chevron-up"></i>
                        </Button>
                    </form>
                {/if}
                <div class="type-selector">
                    <Dropdown
                        label="Type"
                        value={data.type || 4}
                        on:change={(e) => {
                            const newType = parseInt(e.target.value, 10);
                            const oldType = data.type;
                            data.type = newType;

                            // Clear type-specific fields when switching types
                            if (oldType !== newType) {
                                // Clear options only when switching away from string select (type 3)
                                if (oldType === 3 && newType !== 3) {
                                    data.options = undefined;
                                    data.allow_multiple = undefined;
                                }
                                // Clear text-specific fields when switching away from text input (type 4)
                                if (oldType === 4 && newType !== 4) {
                                    data.placeholder = undefined;
                                    data.style = undefined;
                                    data.min_length = undefined;
                                    data.max_length = undefined;
                                }
                                // Reset text input fields when switching TO text input
                                if (newType === 4 && oldType !== 4) {
                                    data.style = 1; // Default to short style
                                    data.min_length = 0;
                                    data.max_length = 255; // Default max for short style
                                }
                                // Clear min/max for types that don't use them
                                if (
                                    newType !== 3 &&
                                    newType !== 4 &&
                                    (newType < 5 || newType > 8)
                                ) {
                                    data.min_length = undefined;
                                    data.max_length = undefined;
                                }
                            }
                        }}
                    >
                        <option value={4}>Text Input</option>
                        <option value={3}>String Select</option>
                        <option value={5}>User Select</option>
                        <option value={6}>Role Select</option>
                        <option value={7}>Mentionable Select</option>
                        <option value={8}>Channel Select</option>
                    </Dropdown>
                </div>
                {#if withDeleteButton}
                    <form
                        on:submit|preventDefault={forwardDelete}
                        class="button-form"
                    >
                        <Button icon="fas fa-trash" danger={true}>Delete</Button
                        >
                    </form>
                {/if}
            {/if}
        </div>
    </div>
    {#if hasInvalidLabel}
        <div class="validation-error" style="margin-top: 8px; margin-bottom: 8px;">
            <i class="fas fa-exclamation-triangle"></i>
            <span>
                {#if !data.label || data.label.trim().length === 0}
                    Label is required
                {:else}
                    Label must be 45 characters or less (currently {data.label.length})
                {/if}
            </span>
        </div>
    {/if}
    <div class="row">
        <div class="sub-row" style="flex: 1">
            <Input
                col1={true}
                label="Description (Optional)"
                bind:value={data.description}
                placeholder="Description for the field"
            />
        </div>
    </div>
    {#if hasInvalidDescription}
        <div class="validation-error" style="margin-top: 8px; margin-bottom: 8px;">
            <i class="fas fa-exclamation-triangle"></i>
            <span>
                Description must be 100 characters or less (currently {data.description.length})
            </span>
        </div>
    {/if}

    <!-- String Select Options (type 3 only) -->
    {#if data.type == 3}
        <div class="row settings-row">
            <div class="col-1">
                <div class="dropdown-items-section">
                    <div class="dropdown-header">
                        <label class="form-label">String Select Options</label>
                        {#if !data.options || data.options.length < 25}
                            <Button
                                icon="fas fa-plus"
                                on:click={addDropdownItem}
                                small={true}
                            >
                                Add Option
                            </Button>
                        {/if}
                    </div>
                    <div class="dropdown-constraints">
                        <div class="constraint-row">
                            <Input
                                col2={true}
                                label="Minimum Selections"
                                type="number"
                                value={data.min_length || ""}
                                on:input={(e) => {
                                    const val = e.target.value;
                                    data.min_length =
                                        val === ""
                                            ? undefined
                                            : parseInt(val, 10);
                                }}
                                placeholder="0"
                                min={0}
                                max={Math.min(
                                    data.max_length ||
                                        data.options?.length ||
                                        0,
                                    data.options?.length || 0,
                                )}
                                disabled={!data.options?.length}
                            />
                            <Input
                                col2={true}
                                label="Maximum Selections"
                                type="number"
                                value={data.max_length || ""}
                                on:input={(e) => {
                                    const val = e.target.value;
                                    data.max_length =
                                        val === ""
                                            ? undefined
                                            : parseInt(val, 10);
                                }}
                                placeholder={String(data.options?.length || 0)}
                                min={Math.max(data.min_length || 0, 1)}
                                max={data.options?.length || 0}
                                disabled={!data.options?.length}
                            />
                        </div>
                        <div class="constraint-info">
                            {#if data.allow_multiple && (data.min_length || data.max_length)}
                                <span class="constraint-text">
                                    Users must select
                                    {#if data.min_length && data.max_length}
                                        between {data.min_length} and {data.max_length}
                                        options
                                    {:else if data.min_length}
                                        at least {data.min_length} option{data.min_length >
                                        1
                                            ? "s"
                                            : ""}
                                    {:else if data.max_length}
                                        at most {data.max_length} option{data.max_length >
                                        1
                                            ? "s"
                                            : ""}
                                    {/if}
                                </span>
                            {/if}
                        </div>
                    </div>
                    {#if hasNoOptions}
                        <div class="validation-error">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span>
                                No dropdown options added yet. Click "Add Option" to create up to 25 options.
                            </span>
                        </div>
                    {/if}
                    {#if hasDuplicateValues}
                        <div class="validation-error">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span>
                                Duplicate option values detected: {duplicateValues.join(", ")}.
                                Each option must have a unique value.
                            </span>
                        </div>
                    {/if}
                    {#if data.options && data.options.length > 0}
                        <div class="dropdown-items-list">
                            {#each data.options as item, i}
                                <div class="dropdown-item-container">
                                    <div class="dropdown-item-header">
                                        <span class="option-number"
                                            >Option {i + 1}</span
                                        >
                                        <Button
                                            icon="fas fa-times"
                                            danger={true}
                                            small={true}
                                            on:click={() =>
                                                removeDropdownItem(i)}
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                    <div class="dropdown-item-fields">
                                        <div class="dropdown-field-row">
                                            <Input
                                                col2={true}
                                                label="Label"
                                                placeholder="Display text"
                                                value={item.label}
                                                on:input={(e) =>
                                                    updateDropdownItem(
                                                        i,
                                                        "label",
                                                        e.target.value,
                                                    )}
                                            />
                                            <div class="value-input-wrapper" class:has-duplicate={item.value && duplicateValues.includes(item.value)}>
                                                <Input
                                                    col1={true}
                                                    label="Value"
                                                    placeholder="Internal value"
                                                    value={item.value}
                                                    on:input={(e) =>
                                                        updateDropdownItem(
                                                            i,
                                                            "value",
                                                            e.target.value,
                                                        )}
                                                />
                                                {#if item.value && duplicateValues.includes(item.value)}
                                                    <span class="duplicate-indicator">Duplicate</span>
                                                {/if}
                                            </div>
                                        </div>
                                        <div class="dropdown-field-row">
                                            <Input
                                                col1={true}
                                                label="Description (Optional)"
                                                placeholder="Description for this option"
                                                value={item.description}
                                                on:input={(e) =>
                                                    updateDropdownItem(
                                                        i,
                                                        "description",
                                                        e.target.value,
                                                    )}
                                            />
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    <!-- Select Types Configuration (types 5-8) -->
    {#if data.type >= 5 && data.type <= 8}
        <div class="row settings-row">
            <div class="col-1">
                <div class="select-config-section">
                    <div class="select-config-header">
                        <label class="form-label">
                            {#if data.type == 5}
                                User Select Configuration
                            {:else if data.type == 6}
                                Role Select Configuration
                            {:else if data.type == 7}
                                Channel Select Configuration
                            {:else if data.type == 8}
                                Mentionable Select Configuration
                            {/if}
                        </label>
                    </div>
                    <div class="select-config-options">
                        <div class="config-row">
                            <Input
                                col2={true}
                                label="Minimum Selections"
                                type="number"
                                value={data.min_length || ""}
                                on:input={(e) => {
                                    const val = e.target.value;
                                    data.min_length =
                                        val === ""
                                            ? undefined
                                            : parseInt(val, 10);
                                }}
                                placeholder="0"
                                min={0}
                                max={data.max_length || 25}
                            />
                            <Input
                                col2={true}
                                label="Maximum Selections"
                                type="number"
                                value={data.max_length || ""}
                                on:input={(e) => {
                                    const val = e.target.value;
                                    data.max_length =
                                        val === ""
                                            ? undefined
                                            : parseInt(val, 10);
                                }}
                                placeholder="25"
                                min={Math.max(data.min_length || 0, 1)}
                                max={25}
                            />
                        </div>
                        <div class="config-info">
                            {#if data.min_length || data.max_length}
                                <span class="config-text">
                                    Users must select
                                    {#if data.min_length && data.max_length}
                                        between {data.min_length} and {data.max_length}
                                        {#if data.type == 5}users
                                        {:else if data.type == 6}roles
                                        {:else if data.type == 7}channels
                                        {:else}items{/if}
                                    {:else if data.min_length}
                                        at least {data.min_length}
                                        {#if data.type == 5}user{data.min_length >
                                            1
                                                ? "s"
                                                : ""}
                                        {:else if data.type == 6}role{data.min_length >
                                            1
                                                ? "s"
                                                : ""}
                                        {:else if data.type == 7}channel{data.min_length >
                                            1
                                                ? "s"
                                                : ""}
                                        {:else}item{data.min_length > 1
                                                ? "s"
                                                : ""}{/if}
                                    {:else if data.max_length}
                                        at most {data.max_length}
                                        {#if data.type == 5}user{data.max_length >
                                            1
                                                ? "s"
                                                : ""}
                                        {:else if data.type == 6}role{data.max_length >
                                            1
                                                ? "s"
                                                : ""}
                                        {:else if data.type == 7}channel{data.max_length >
                                            1
                                                ? "s"
                                                : ""}
                                        {:else}item{data.max_length > 1
                                                ? "s"
                                                : ""}{/if}
                                    {/if}
                                </span>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Text Input Configuration (type 4) -->
    {#if data.type == 4 || data.type == null}
        <div class="row settings-row">
            <Textarea
                col2={true}
                label="Placeholder (Optional)"
                bind:value={data.placeholder}
                minHeight="120px"
                placeholder="Placeholder text for the field, just like this text"
            />
            <div class="col-2 properties-group">
                <div class="row">
                    <Dropdown
                        col1={true}
                        label="Style"
                        value={data.style || 1}
                        on:change={updateStyle}
                    >
                        <option value={1}>Short</option>
                        <option value={2}>Multi-line</option>
                    </Dropdown>
                </div>
                <div class="row" style="gap: 10px">
                    <Checkbox
                        id={`required-${formId}-${index}`}
                        label="Required"
                        bind:value={data.required}
                    />
                    {#if data.style == 1}
                        <DoubleRangeSlider
                            label="Answer Length Range"
                            bind:start={data.min_length}
                            bind:end={data.max_length}
                            min={0}
                            max={255}
                        />
                    {:else}
                        <DoubleRangeSlider
                            label="Answer Length Range"
                            bind:start={data.min_length}
                            bind:end={data.max_length}
                            min={0}
                            max={1024}
                        />
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    {#if windowWidth <= 950}
        <div class="col-1">
            <div class="row">
                <div
                    class="type-selector"
                    style="width: 100%; margin-bottom: 10px;"
                >
                    <Dropdown
                        label="Type"
                        value={data.type || 4}
                        on:change={(e) => {
                            const newType = parseInt(e.target.value, 10);
                            const oldType = data.type;
                            data.type = newType;

                            // Clear type-specific fields when switching types
                            if (oldType !== newType) {
                                // Clear options only when switching away from string select (type 3)
                                if (oldType === 3 && newType !== 3) {
                                    data.options = undefined;
                                    data.allow_multiple = undefined;
                                }
                                // Clear text-specific fields when switching away from text input (type 4)
                                if (oldType === 4 && newType !== 4) {
                                    data.placeholder = undefined;
                                    data.style = undefined;
                                    data.min_length = undefined;
                                    data.max_length = undefined;
                                }
                                // Reset text input fields when switching TO text input
                                if (newType === 4 && oldType !== 4) {
                                    data.style = 1; // Default to short style
                                    data.min_length = 0;
                                    data.max_length = 255; // Default max for short style
                                }
                                // Clear min/max for types that don't use them
                                if (
                                    newType !== 3 &&
                                    newType !== 4 &&
                                    (newType < 5 || newType > 8)
                                ) {
                                    data.min_length = undefined;
                                    data.max_length = undefined;
                                }
                            }
                        }}
                    >
                        <option value={4}>Text Input</option>
                        <option value={3}>String Select</option>
                        <option value={5}>User Select</option>
                        <option value={6}>Role Select</option>
                        <option value={7}>Channel Select</option>
                        <option value={8}>Mentionable Select</option>
                    </Dropdown>
                </div>
            </div>
            {#if withDirectionButtons}
                <div class="row">
                    <div class="col-2-force">
                        <form
                            on:submit|preventDefault={() => forwardMove("down")}
                            class="button-form"
                        >
                            <Button
                                fullWidth={true}
                                disabled={index >= formLength - 1}
                            >
                                <i class="fas fa-chevron-down"></i>
                            </Button>
                        </form>
                    </div>
                    <div class="col-2-force">
                        <form
                            on:submit|preventDefault={() => forwardMove("up")}
                            class="button-form"
                        >
                            <Button fullWidth={true} disabled={index === 0}>
                                <i class="fas fa-chevron-up"></i>
                            </Button>
                        </form>
                    </div>
                </div>
            {/if}
            <div class="row">
                <div class="col-1-force">
                    {#if withDeleteButton}
                        <form
                            on:submit|preventDefault={forwardDelete}
                            class="button-form"
                        >
                            <Button icon="fas fa-trash" danger={true}
                                >Delete</Button
                            >
                        </form>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    {#if withCreateButton && false}
        <div class="row" style="justify-content: center; margin-top: 10px">
            <Button type="submit" icon="fas fa-plus" {disabled}
                >Add Input</Button
            >
        </div>
    {/if}
</form>

<svelte:window bind:innerWidth={windowWidth} />

<style>
    .input-form {
        display: flex;
        flex-direction: column;
        width: 100%;
        border-top: 1px solid rgba(0, 0, 0, 0.25);
        padding-top: 10px;
    }

    .row {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        width: 100%;
        height: 100%;
    }

    .sub-row {
        display: flex;
        flex-direction: row;
    }

    .button-form {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        padding-bottom: 0.5em;
    }

    .buttons-row > :not(:last-child) {
        margin-right: 10px;
    }

    .dropdown-items-section,
    .select-config-section {
        width: 100%;
        padding: 10px 0;
    }

    .type-selector {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        min-width: 180px;
    }

    .type-selector :global(.form-label) {
        font-size: 12px;
        margin-bottom: 4px;
    }

    .dropdown-header,
    .select-config-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
    }

    .select-config-options {
        background: rgba(0, 0, 0, 0.02);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 6px;
        padding: 15px;
    }

    .config-row {
        display: flex;
        gap: 10px;
    }

    .config-row :global(.col-2) {
        flex: 1;
    }

    .config-info {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        color: var(--text-secondary, #666);
        flex-wrap: wrap;
    }

    .config-text {
        font-size: 13px;
        color: var(--text-secondary, #666);
        font-style: italic;
        background: rgba(0, 0, 0, 0.03);
        border-radius: 4px;
    }

    .dropdown-constraints {
        background: rgba(0, 0, 0, 0.02);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 6px;
        padding: 15px;
        margin-bottom: 20px;
    }

    .constraint-row {
        display: flex;
        gap: 10px;
        margin-bottom: 10px;
    }

    .constraint-row :global(.col-2) {
        flex: 1;
    }

    .constraint-info {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        color: var(--text-secondary, #666);
        flex-wrap: wrap;
    }

    .constraint-text {
        font-size: 13px;
        color: var(--text-secondary, #666);
        font-style: italic;
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.03);
        border-radius: 4px;
    }

    .dropdown-label {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-primary, #333);
    }

    .dropdown-items-list {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .dropdown-item-container {
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 6px;
        padding: 15px;
        background: rgba(0, 0, 0, 0.01);
    }

    .dropdown-item-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    }

    .option-number {
        font-weight: 600;
        color: var(--text-primary, #333);
        font-size: 14px;
    }

    .dropdown-item-fields {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .dropdown-field-row {
        display: flex;
        gap: 10px;
        align-items: flex-start;
    }

    .dropdown-field-row :global(.col-2) {
        flex: 1;
    }

    .dropdown-field-row :global(.col-1) {
        width: 100%;
    }

    .empty-state {
        padding: 20px;
        text-align: center;
        background: rgba(0, 0, 0, 0.02);
        border-radius: 4px;
    }

    .empty-state p {
        margin: 0;
        color: var(--text-secondary, #666);
        font-size: 14px;
    }

    .validation-error {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 15px;
        background: rgba(220, 53, 69, 0.1);
        border: 1px solid rgba(220, 53, 69, 0.3);
        border-radius: 6px;
        color: #dc3545;
        font-size: 14px;
        margin-bottom: 15px;
    }

    .validation-error i {
        font-size: 16px;
    }

    .value-input-wrapper {
        position: relative;
        flex: 1;
    }

    .value-input-wrapper.has-duplicate :global(input) {
        border-color: #dc3545 !important;
        background-color: rgba(220, 53, 69, 0.05) !important;
    }

    .duplicate-indicator {
        position: absolute;
        top: -1px;
        right: 0;
        font-size: 11px;
        color: #dc3545;
        font-weight: 600;
        text-transform: uppercase;
        background: rgba(220, 53, 69, 0.1);
        padding: 2px 6px;
        border-radius: 3px;
        pointer-events: none;
    }

    @media only screen and (max-width: 950px) {
        .settings-row {
            flex-direction: column-reverse !important;
        }

        .button-form {
            width: 100%;
        }
    }

    @media only screen and (max-width: 576px) {
        .properties-group > div:nth-child(2) {
            flex-direction: column;
        }
    }

    .buttons-row {
        align-items: flex-end; /* Align items to bottom */
    }

    .type-selector :global(select) {
        height: 48px;
        padding: 0.75rem 1rem;
    }

    .button-form :global(button) {
        height: 48px;
        min-height: 48px;
        box-sizing: border-box;
    }
</style>
