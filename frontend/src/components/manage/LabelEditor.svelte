<script>
    import { createEventDispatcher, onMount } from "svelte";
    import ConfirmationModal from "../ConfirmationModal.svelte";
    import Input from "../form/Input.svelte";
    import Colour from "../form/Colour.svelte";
    import { intToColour, colourToInt } from "../../js/util";

    const dispatch = createEventDispatcher();

    /** @type {{label_id?: number, name: string, colour: number} | undefined} */
    export let data = undefined;

    let name = "";
    let colourHex = "#5865F2";

    onMount(() => {
        if (data) {
            name = data.name;
            colourHex = intToColour(data.colour);
        }
    });

    function handleConfirm() {
        dispatch("confirm", {
            label_id: data?.label_id,
            name,
            colour: colourToInt(colourHex),
        });
    }

    function handleKeydown(e) {
        if (e.key === "Escape") {
            dispatch("cancel", {});
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<ConfirmationModal
    icon="fas fa-tag"
    on:confirm={handleConfirm}
    on:cancel={() => dispatch("cancel", {})}
>
    <span slot="title">{data ? "Edit Label" : "Create Label"}</span>
    <div slot="body" class="body-wrapper">
        <div class="row">
            <Input
                col2
                label="Label Name"
                placeholder="e.g. Bug, Feature, Urgent"
                bind:value={name}
            />
            <Colour col4 label="Colour" bind:value={colourHex} />
        </div>

        <div class="preview">
            <span class="preview-label">Preview</span>
            <span class="preview-badge" style="--preview-colour: {colourHex}">
                <span class="preview-dot"></span>
                <span>{name || "Label"}</span>
            </span>
        </div>
    </div>
    <span slot="confirm">{data ? "Save" : "Create"}</span>
</ConfirmationModal>

<style>
    .body-wrapper {
        display: flex;
        flex-direction: column;
        gap: 16px;
        width: 100%;
    }

    .row {
        display: flex;
        flex-direction: row;
        gap: 2%;
    }

    .preview {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .preview-label {
        color: var(--text-secondary, rgba(255, 255, 255, 0.7));
        font-size: 13px;
    }

    .preview-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--preview-colour) 20%, transparent);
        border: 1px solid
            color-mix(in srgb, var(--preview-colour) 40%, transparent);
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary, #fff);
    }

    .preview-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--preview-colour);
    }
</style>
