import type { GuildChannel, GuildRole, User } from "@/types";
import DiscordContent from "../DiscordContent";
import Button from "./Button";

interface SectionProps {
  entities?: {
    users: Record<string, User>;
    channels: Record<string, GuildChannel>;
    roles: Record<string, GuildRole>;
  };
  textComponents?: Array<{
    content: string;
  }>;
  accessory?: {
    type: number;
    media?: {
      url: string;
    };
    style?: number;
    custom_id?: string;
    emoji?: { name: string };
    label?: string;
    url?: string;
  } | null;
}

export default function Section({ textComponents = [], accessory = null, entities }: SectionProps) {
  return (
    <div className="flex items-start bg-black/10 rounded-lg p-3 mb-2">
      <div className="flex-1 flex flex-col gap-1.5">
        {textComponents.slice(0, 3).map((textComp, index) => (
          <DiscordContent
            key={index}
            content={textComp.content}
            entities={entities}
            className="text-[15px]"
          />
        ))}
      </div>
      <div className="ml-3 flex items-center">
        {accessory?.type === 11 && accessory.media?.url && (
          <img src={accessory.media.url} alt="media" className="max-w-20 max-h-20 rounded-md" />
        )}
        {accessory?.type === 2 && (
          <Button
            button_style={accessory.style}
            custom_id={accessory.custom_id}
            emoji={accessory.emoji}
            label={accessory.label}
            url={accessory.url}
          />
        )}
      </div>
    </div>
  );
}
