<script>
    import Input from "../form/Input.svelte";
    import Dropdown from "../form/Dropdown.svelte";
    import Button from "../Button.svelte";
    import Checkbox from "../form/Checkbox.svelte";

    export let apiConfig = null;
    export let hasValidationError = false;

    function initializeApiConfig() {
        if (!apiConfig) {
            apiConfig = {
                endpoint_url: "",
                method: "GET",
                cache_duration_seconds: undefined,
                headers: [],
            };
        }
    }

    function addHeader() {
        if (!apiConfig.headers) {
            apiConfig.headers = [];
        }
        apiConfig.headers = [
            ...apiConfig.headers,
            { header_name: "", header_value: "", is_secret: false },
        ];
    }

    function removeHeader(index) {
        apiConfig.headers = apiConfig.headers.filter((_, i) => i !== index);
    }

    function updateHeader(index, field, value) {
        apiConfig.headers[index][field] = value;
        apiConfig.headers = apiConfig.headers;
    }

    $: if (apiConfig) {
        hasValidationError =
            !apiConfig.endpoint_url ||
            apiConfig.endpoint_url.trim().length === 0;
    } else {
        hasValidationError = false;
    }
</script>

<div class="api-config-section">
    <div class="api-config-header">
        <label class="form-label">API Configuration</label>
    </div>
    <div class="api-config-fields">
        <Input
            col1={true}
            label="Endpoint URL"
            placeholder="https://api.example.com/options"
            bind:value={apiConfig.endpoint_url}
        />
        <Dropdown col1={true} label="HTTP Method" bind:value={apiConfig.method}>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
        </Dropdown>
    </div>

    <div class="headers-section">
        <div class="headers-header">
            <label class="form-label">Headers (Optional)</label>
            <Button icon="fas fa-plus" small={true} on:click={addHeader}>
                Add Header
            </Button>
        </div>

        {#if apiConfig.headers && apiConfig.headers.length > 0}
            <div class="headers-list">
                {#each apiConfig.headers as header, index}
                    <div class="header-row">
                        <Input
                            col2={true}
                            label="Header Name"
                            placeholder="Authorization"
                            value={header.header_name}
                            on:input={(e) =>
                                updateHeader(
                                    index,
                                    "header_name",
                                    e.target.value,
                                )}
                        />
                        <Input
                            col2={true}
                            label="Header Value"
                            placeholder="Bearer token..."
                            value={header.header_value}
                            on:input={(e) =>
                                updateHeader(
                                    index,
                                    "header_value",
                                    e.target.value,
                                )}
                        />
                        <div class="button-wrapper">
                            <Button
                                icon="fas fa-trash"
                                danger={true}
                                small={true}
                                on:click={() => removeHeader(index)}
                            >
                                Remove
                            </Button>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    {#if hasValidationError}
        <div class="validation-error" style="margin-top: 12px;">
            <i class="fas fa-exclamation-triangle"></i>
            <span>Endpoint URL is required for API configuration</span>
        </div>
    {/if}
</div>

<style>
    .api-config-section {
        width: 100%;
        padding: 10px 0;
    }

    .api-config-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
    }

    .api-config-fields {
        background: rgba(0, 0, 0, 0.02);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 6px;
        padding: 15px;
        display: flex;
        flex-direction: column;
        gap: 15px;
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
    }

    .validation-error i {
        font-size: 16px;
    }

    .headers-section {
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid rgba(0, 0, 0, 0.08);
    }

    .headers-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
    }

    .headers-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .header-row {
        display: flex;
        gap: 10px;
        align-items: flex-end;
        background: rgba(0, 0, 0, 0.02);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 6px;
        padding: 12px;
    }

    .header-secret {
        display: flex;
        align-items: flex-end;
        height: 48px;
    }

    .button-wrapper {
        display: flex;
        align-items: flex-end;
        height: 48px;
        margin: 0 0 0.5em 0;
    }
</style>
