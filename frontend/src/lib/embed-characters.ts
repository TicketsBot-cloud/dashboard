type CountableField = { name?: string | null; value?: string | null };

export type CountableEmbed =
  | {
      title?: string | null;
      description?: string | null;
      author?: { name?: string | null } | null;
      footer?: { text?: string | null } | null;
      fields?: CountableField[] | null;
    }
  | null
  | undefined;

const length = (value?: string | null) => (value ? [...value].length : 0);

// Runes, matching the backend.
export function countEmbedCharacters(embed: CountableEmbed): number {
  if (!embed) return 0;

  let total =
    length(embed.title) +
    length(embed.description) +
    length(embed.author?.name) +
    length(embed.footer?.text);

  for (const field of embed.fields ?? []) {
    total += length(field.name) + length(field.value);
  }

  return total;
}
