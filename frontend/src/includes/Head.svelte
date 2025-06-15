<svelte:head>
  <title>{TITLE}</title>

  <!-- Meta -->
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <meta name="description" content={DESCRIPTION}>

  <link rel="shortcut icon" href={FAVICON} type="image/x-icon">
  <link rel="icon" href={FAVICON} type={FAVICON_TYPE}>

  <!-- Icons -->
  <link rel="stylesheet" href="https://use.fontawesome.com/releases/v6.4.0/css/all.css">
</svelte:head>

<script>
  import { TITLE, DESCRIPTION, FAVICON, FAVICON_TYPE } from "../js/constants";
</script>