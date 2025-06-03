<script>
    import Card from "../../components/Card.svelte";
</script>

<div class="content">
    <div class="card-wrapper">
        <Card footer={false} fill={false}>
            <span slot="title"> Terms of Service </span>
            <div slot="body" style="width: 100%">
                <p>
                    Please read these terms of service ("terms", "terms of
                    service") carefully before using Tickets Discord bot and
                    tickets.bot (the "service") operated by
                    tickets.bot ("us", 'we", "our").
                </p>
                <br />
                <p>
                    We will provide their services to you, which are subject to
                    the conditions stated below in this document. Every time you
                    visit this website, use its services or make a purchase, you
                    accept the following conditions.
                </p>
                <br />
                <p>
                    By using the service, you represent and warrant that you
                    agree to these terms, and have the legal capacity to do so.
                </p>
                <hr />
                <h2>Privacy</h2>
                <p>
                    When you visit this website or use the service, we collect
                    information about you. Please review our <a
                        href="/legal/privacy">privacy policy</a
                    > for further information.
                </p>
                <hr />
                <h2>User Guidelines</h2>
                <ol>
                    <li>
                        Do not take any actions to attempt to abuse or purposely
                        disrupt or cause other damage to the service.
                    </li>
                    <li>
                        Do not use the service in a manner inconsistent with any
                        applicable laws or regulations of your local region and
                        the United Kingdom.
                    </li>
                    <li>
                        Do not attempt to access any data that you are not
                        permitted to.
                    </li>
                    <li>
                        Do not interfere with, disrupt, or create an undue
                        burden on the service or the networks or services
                        connected to the service.
                    </li>
                    <li>
                        Do not attempt to bypass any measures of the service
                        designed to prevent or restrict access to the service,
                        or any portion of the service.
                    </li>
                    <li>
                        Do not use the service to process or store adult visual
                        media content, including but not restricted to images
                        and videos.
                    </li>
                    <li>
                        Do not use the service to process or store
                        privacy-sensitive data from users, such as identity
                        documents.
                    </li>
                    <li>
                        Do not use the service to, or in association to a way
                        that would, violate the <a
                            href="https://discord.com/terms"
                            >Discord Terms of Service</a
                        >
                        or
                        <a href="https://discord.com/guidelines"
                            >Discord Community Guidelines</a
                        >. Please take additional care to review the following
                        extracts:
                        <blockquote>
                            <br />
                            You agree not to use the Service in order to:
                            <br />
                            ...
                            <br />
                            Exploit, distribute or publicly inform other members
                            of any game error, miscue or bug which gives an unintended
                            advantage; violate any applicable laws or regulations;
                            or promote or encourage illegal activity including, but
                            not limited to, hacking, cracking or distribution of
                            counterfeit software, compromised accounts, or cheats
                            or hacks for the Service.
                        </blockquote>
                        <blockquote>
                            Do not abuse Discord products in any way, such as
                            selling or purchasing an account or server, or
                            participating in fraudulent Nitro incentives or
                            <strong>Boosting activities</strong>.
                        </blockquote>
                    </li>
                </ol>
            </div>
        </Card>
    </div>
</div>

<style>
    blockquote {
        border-left: 10px solid #ccc;
        margin: 1.5em 10px;
        padding: 0.5em 10px;
    }
    blockquote:before {
        color: #ccc;
        content: open-quote;
        font-size: 4em;
        line-height: 0.1em;
        margin-right: 0.25em;
        vertical-align: -0.4em;
    }
    blockquote p {
        display: inline;
    }
    .content {
        display: flex;
        height: 100%;
        width: 100%;
        justify-content: center;
    }

    h3 {
        font-weight: bold !important;
    }

    .card-wrapper {
        display: block;
        width: 75%;
        margin-top: 5%;
    }

    @media (max-width: 576px) {
        .card-wrapper {
            width: 100%;
        }
    }
</style>
