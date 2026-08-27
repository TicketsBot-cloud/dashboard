import type { GuildChannel, GuildRole, Message, User } from "@/types";
import type { APIEmbed, ButtonStyle } from "discord-api-types/v10";

export interface DiscordMessageProps {
  message: Message;
  entities: {
    users: Record<string, User>;
    channels: Record<string, GuildChannel>;
    roles: Record<string, GuildRole>;
  };
  compact?: boolean;
  showTimestamp?: boolean;
  className?: string;
}

export interface DiscordAuthorProps {
  user: User;
  timestamp?: string;
  compact?: boolean;
  className?: string;
}

export interface DiscordEmbedProps {
  embed: APIEmbed;
  entities?: {
    users: Record<string, User>;
    channels: Record<string, GuildChannel>;
    roles: Record<string, GuildRole>;
  };
  className?: string;
}

export interface DiscordContentProps {
  content: string;
  entities?: {
    users: Record<string, User>;
    channels: Record<string, GuildChannel>;
    roles: Record<string, GuildRole>;
  };
  className?: string;
}

export interface DiscordComponentsProps {
  entities?: {
    users: Record<string, User>;
    channels: Record<string, GuildChannel>;
    roles: Record<string, GuildRole>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components: any[];
  className?: string;
}

export interface DiscordButtonProps {
  label?: string;
  style: ButtonStyle;
  disabled?: boolean;
  emoji?: {
    id?: string;
    name?: string;
    animated?: boolean;
  };
  url?: string;
  onClick?: () => void;
  className?: string;
}

export interface DiscordSelectMenuProps {
  placeholder?: string;
  options: Array<{
    label: string;
    value: string;
    description?: string;
    emoji?: {
      id?: string;
      name?: string;
      animated?: boolean;
    };
    default?: boolean;
  }>;
  disabled?: boolean;
  minValues?: number;
  maxValues?: number;
  onChange?: (values: string[]) => void;
  className?: string;
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbedAuthor {
  name: string;
  url?: string;
  icon_url?: string;
}

export interface DiscordEmbedFooter {
  text: string;
  icon_url?: string;
}

export interface DiscordEmbedImage {
  url: string;
  width?: number;
  height?: number;
}

export interface DiscordEmbedThumbnail {
  url: string;
  width?: number;
  height?: number;
}
