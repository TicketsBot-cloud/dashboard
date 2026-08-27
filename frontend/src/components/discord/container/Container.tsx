import type { GuildChannel, GuildRole, User } from "@/types";
import DiscordContent from "../DiscordContent";
import ActionRow from "./ActionRow";
import Button from "./Button";
import MediaGallery from "./MediaGallery";
import Section from "./Section";

interface ContainerProps {
  entities?: {
    users: Record<string, User>;
    channels: Record<string, GuildChannel>;
    roles: Record<string, GuildRole>;
  };
  component?: {
    spoiler?: boolean;
    accent_color?: string;
    type?: number;
    emoji?: { name: string };
    label?: string;
    components?: Array<{
      type: number;
      style?: number;
      custom_id?: string;
      emoji?: { name: string; id?: string; animated?: boolean };
      label?: string;
      url?: string;
      components?: Array<{
        type: number;
        style?: number;
        custom_id?: string;
        emoji?: { name: string };
        label?: string;
        placeholder?: string;
        options?: Array<{
          value: string;
          label: string;
          description?: string;
          emoji?: { name: string };
        }>;
        content?: string;
      }>;
      content?: string;
      items?: Array<{
        spoiler?: boolean;
        media?: {
          url: string;
        };
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
    }>;
  };
}

export default function Container({ component = {}, entities }: ContainerProps) {
  const borderColor = component.accent_color || "transparent";
  const spoilerClass = component.spoiler ? "blur hover:blur-none" : "";

  return (
    <div
      className={`bg-[#242429] rounded p-3 my-1 max-w-130 w-full ${spoilerClass}`}
      style={{ borderLeft: `6px solid ${borderColor}` }}
    >
      {component.components && component.components.length > 0 && (
        <>
          {component.components.map((subcomponent, index) => {
            if (subcomponent.type === 1) {
              return <ActionRow key={index} components={subcomponent.components} />;
            } else if (subcomponent.type === 2) {
              return (
                <Button
                  key={index}
                  button_style={subcomponent.style}
                  custom_id={subcomponent.custom_id}
                  emoji={subcomponent.emoji}
                  label={subcomponent.label}
                  url={subcomponent.url}
                />
              );
            } else if (subcomponent.type === 9) {
              return (
                <Section
                  key={index}
                  entities={entities}
                  textComponents={subcomponent.components
                    ?.filter((comp) => comp.content)
                    .map((comp) => ({ content: comp.content! }))}
                  accessory={subcomponent.accessory}
                />
              );
            } else if (subcomponent.type === 10) {
              return (
                <DiscordContent
                  key={index}
                  content={subcomponent.content || ""}
                  entities={entities}
                />
              );
            } else if (subcomponent.type === 12) {
              return <MediaGallery key={index} items={subcomponent.items} />;
            } else if (subcomponent.type === 13) {
              return (
                <div key={index} className="my-1">
                  <input
                    type="file"
                    disabled
                    aria-label="File upload"
                    title="File upload"
                    className="opacity-50 cursor-not-allowed"
                  />
                </div>
              );
            } else if (subcomponent.type === 14) {
              return <div key={index} className="h-px w-full bg-gray-600/50 my-1 max-w-130" />;
            } else {
              return (
                <div
                  key={index}
                  className="border border-dashed border-gray-500 rounded p-2 text-gray-500 text-xs italic my-1"
                >
                  Unknown Component Type: {subcomponent.type}
                </div>
              );
            }
          })}
        </>
      )}
    </div>
  );
}
