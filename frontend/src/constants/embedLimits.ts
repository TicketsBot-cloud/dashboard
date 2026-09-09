// https://docs.discord.com/developers/resources/message#embed-object
export const EMBED_LIMITS = {
  TITLE: 256,
  DESCRIPTION: 4096,
  AUTHOR_NAME: 256,
  FOOTER_TEXT: 2048,
  FIELD_NAME: 256,
  FIELD_VALUE: 1024,
  FIELDS: 25,
  // Not a Discord limit: the width of the url columns in the embeds table.
  URL: 255,
  TOTAL: 6000,
} as const;
