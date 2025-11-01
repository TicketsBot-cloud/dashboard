<script>
    import { fade } from 'svelte/transition';
    import Card from './Card.svelte';
    import Button from './Button.svelte';
    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher();

    function closeModal() {
        dispatch('close');
    }

    let wrapper;

    // Close modal when clicking outside
    function handleOutsideClick(event) {
        // Only close if clicking directly on the modal backdrop
        if (event.target.classList.contains('modal')) {
            closeModal();
        }
    }
</script>

<svelte:window on:click={handleOutsideClick} />

<div class="modal" transition:fade={{ duration: 300 }}>
    <div class="modal-wrapper" bind:this={wrapper}>
        <Card footer={true} footerRight={true} fill={false}>
            <span slot="title">Dashboard Access Required</span>

            <div slot="body" class="body-wrapper">
                <p class="intro">
                    For your server to appear on the dashboard, you need to be a designated <strong>Support Representative</strong> or <strong>Admin User</strong> for the @Tickets v2 bot in that server.
                </p>

                <div class="info-section">
                    <h3><i class="fas fa-check-circle"></i> How to Check Your Role</h3>
                    <p>
                        Run <code>/viewstaff</code> in your server to see who has access.
                    </p>
                </div>

                <div class="info-section">
                    <h3><i class="fas fa-user-shield"></i> Permission Levels</h3>
                    <ul>
                        <li>
                            <strong>Support Representatives:</strong> Limited dashboard access to tickets they can see and the tags page.
                        </li>
                        <li>
                            <strong>Admin Users:</strong> Full access to the entire bot dashboard, including adding/changing/removing settings and panels.
                        </li>
                    </ul>
                    <p class="learn-more">
                        <a href="https://docs.tickets.bot/setup/staff" target="_blank" rel="noopener noreferrer">
                            Learn more about Support and Admin roles <i class="fas fa-external-link-alt"></i>
                        </a>
                    </p>
                </div>

                <div class="info-section important">
                    <h3><i class="fas fa-exclamation-triangle"></i> Important Notes</h3>
                    <ul>
                        <li>
                            The Tickets dashboard <strong>does not check for server permissions</strong>. Discord's Administrator permission no longer provides access.
                        </li>
                        <li>
                            Ask your server owner or an existing Admin User to run <code>/addadmin @yourUsername</code> in your server.
                        </li>
                        <li>
                            After being added as an Admin User or Support Representative, you may need to <a href="/logout" class="logout-link">re-login</a> to the dashboard for the changes to take effect.
                        </li>
                    </ul>
                </div>
            </div>

            <div slot="footer">
                <Button on:click={closeModal}>
                    Got it
                </Button>
            </div>
        </Card>
    </div>
</div>

<div class="modal-backdrop" transition:fade={{ duration: 300 }}></div>

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
        width: 60%;
        max-width: 800px;
        max-height: 90vh;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        margin: 20px;
    }

    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1000;
        background-color: #000;
        opacity: 0.5;
    }

    .body-wrapper {
        display: flex;
        flex-direction: column;
        gap: 20px;
        color: #e0e0e0;
        line-height: 1.6;
        word-wrap: break-word;
        overflow-wrap: break-word;
    }

    .intro {
        font-size: 15px;
        margin: 0;
    }

    .info-section {
        padding: 16px;
        background: rgba(26, 31, 46, 0.5);
        border-radius: 8px;
        border-left: 3px solid #5865f2;
        overflow-wrap: break-word;
    }

    .info-section.important {
        border-left-color: #faa61a;
        background: rgba(250, 166, 26, 0.05);
    }

    .info-section h3 {
        margin: 0 0 12px 0;
        font-size: 16px;
        color: #ffffff;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .info-section h3 i {
        color: #5865f2;
    }

    .info-section.important h3 i {
        color: #faa61a;
    }

    .info-section p {
        margin: 8px 0;
    }

    .info-section ul {
        margin: 8px 0;
        padding-left: 20px;
    }

    .info-section li {
        margin: 8px 0;
    }

    code {
        background: rgba(0, 0, 0, 0.3);
        padding: 2px 6px;
        border-radius: 3px;
        font-family: 'Courier New', monospace;
        color: #faa61a;
        font-size: 14px;
        word-break: break-all;
        overflow-wrap: anywhere;
    }

    .learn-more {
        margin-top: 12px;
        font-size: 14px;
    }

    .learn-more a {
        color: #5865f2;
        text-decoration: none;
        transition: color 0.2s;
    }

    .learn-more a:hover {
        color: #7289da;
        text-decoration: underline;
    }

    .learn-more i {
        font-size: 12px;
    }

    .logout-link {
        color: #5865f2;
        text-decoration: none;
        font-weight: bold;
        transition: color 0.2s;
    }

    .logout-link:hover {
        color: #7289da;
        text-decoration: underline;
    }

    strong {
        color: #ffffff;
    }

    @media only screen and (max-width: 1280px) {
        .modal-wrapper {
            width: 90%;
        }
    }

    @media only screen and (max-width: 768px) {
        .modal {
            align-items: flex-start;
            overflow-y: auto;
        }

        .modal-wrapper {
            width: 100%;
            max-height: none;
        }

        .body-wrapper {
            gap: 16px;
        }

        .info-section {
            padding: 12px;
        }

        .info-section h3 {
            font-size: 15px;
            flex-wrap: wrap;
        }

        .info-section ul {
            padding-left: 16px;
        }

        .info-section li {
            margin: 6px 0;
        }

        .intro {
            font-size: 14px;
        }

        code {
            font-size: 12px;
            padding: 2px 4px;
        }
    }
</style>
