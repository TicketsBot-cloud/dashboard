import type { FC } from "react";
import { EMBED_LIMITS } from "@/constants/embedLimits";
import { countEmbedCharacters, type CountableEmbed } from "@/lib/embed-characters";

interface EmbedCharacterTotalProps {
  embed: CountableEmbed;
}

const EmbedCharacterTotal: FC<EmbedCharacterTotalProps> = ({ embed }) => {
  const total = countEmbedCharacters(embed);
  const exceeded = total > EMBED_LIMITS.TOTAL;

  return (
    <p className={`mt-3 text-xs ${exceeded ? "text-red-400" : "text-gray-400"}`} aria-live="polite">
      Total: {total.toLocaleString()}/{EMBED_LIMITS.TOTAL.toLocaleString()} characters
      {exceeded && " — Discord will reject this embed"}
    </p>
  );
};

export default EmbedCharacterTotal;
