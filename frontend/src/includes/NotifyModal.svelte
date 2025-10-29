{#if $notifyModal}
  <div class="modal" transition:fade="{{duration: 500}}">
    <div class="modal-wrapper" bind:this={wrapper}>
      <Card footer="{true}" footerRight="{true}" fill="{false}">
        <span slot="title">{$notifyTitle}</span>

        <div slot="body">
          <span>{$notifyMessage}</span>

          {#if $notifyInternalError}
            <div class="internal-error-container">
              <div class="error-toggle" on:click|stopPropagation={() => internalErrorRevealed = !internalErrorRevealed}>
                <i class="fas fa-chevron-{internalErrorRevealed ? 'up' : 'down'}"></i>
                Click to view error details
              </div>
              {#if internalErrorRevealed}
                <div class="internal-error-text" transition:slide="{{ duration: 200 }}">
                  {$notifyInternalError}
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <div slot="footer">
          <Button on:click={closeNotificationModal}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  </div>

  <div class="modal-backdrop" transition:fade="{{duration: 500}}">
  </div>
{/if}

<script>
    import {notifyMessage, notifyModal, notifyTitle, notifyInternalError} from "../js/stores";
    import {closeNotificationModal} from "../js/util";
    import {fade, slide} from 'svelte/transition'
    import Card from '../components/Card.svelte'
    import Button from '../components/Button.svelte'

    let wrapper;
    let internalErrorRevealed = false;

    // Reset the revealed state when modal closes
    $: if (!$notifyModal) {
        internalErrorRevealed = false;
    }

    document.addEventListener('click', (e) => {
        if (!notifyModal) {
            return;
        }

        let current = e.target;
        let wrapperFound = false;

        while (current) {
            if (current.attributes) {
                if (current.hasAttribute('istrigger')) {
                    wrapperFound = true;
                    break;
                }
            }

            if (current === wrapper) {
                wrapperFound = true;
                break;
            } else {
                current = current.parentNode;
            }
        }

        if (!wrapperFound) {
            closeNotificationModal();
        }
    });
</script>

<style>
    .modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1001;

        display: flex;
        justify-content: center;
        align-items: center;
    }

    .modal-wrapper {
        display: flex;
        width: 50%;
    }

    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1000;
        background-color: #000;
        opacity: .5;
    }

    .footer {
        display: flex;
        width: 100%;
        height: 100%;
    }

    .internal-error-container {
        margin-top: 12px;
    }

    .error-toggle {
        color: rgba(255, 255, 255, 0.5);
        font-size: 0.85em;
        cursor: pointer;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        user-select: none;
    }

    .error-toggle:hover {
        color: rgba(255, 255, 255, 0.7);
    }

    .error-toggle i {
        font-size: 0.8em;
    }

    .internal-error-text {
        margin-top: 8px;
        padding: 8px 12px;
        font-family: monospace;
        font-size: 0.85em;
        white-space: pre-wrap;
        word-break: break-word;
        color: rgba(255, 200, 200, 0.9);
        background-color: rgba(255, 100, 100, 0.1);
        border: 1px solid rgba(255, 100, 100, 0.3);
        border-radius: 4px;
    }
</style>