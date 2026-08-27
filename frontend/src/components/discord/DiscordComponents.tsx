import type { FC } from "react";
import { ComponentType } from "discord-api-types/v10";
import type { DiscordComponentsProps } from "./types";
import ActionRow from "./container/ActionRow";
import Button from "./container/Button";
import SelectMenu from "./container/SelectMenu";
import MediaGallery from "./container/MediaGallery";
import Container from "./container/Container";
import Section from "./container/Section";

const DiscordComponents: FC<DiscordComponentsProps> = ({
  components,
  entities,
  className = "",
}) => {
  if (!components || components.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-col gap-2 mt-3 ${className}`}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {components.map((component: any, index: number) => {
        switch (component.type) {
          case ComponentType.ActionRow:
            return <ActionRow key={index} components={component.components} />;

          case ComponentType.Button:
            return (
              <Button
                key={index}
                button_style={component.style}
                custom_id={component.custom_id}
                emoji={component.emoji}
                label={component.label}
                url={component.url}
              />
            );

          case ComponentType.StringSelect:
            return (
              <SelectMenu
                key={index}
                type="string-select"
                custom_id={component.custom_id}
                placeholder={component.placeholder}
                options={component.options}
                disabled={component.disabled}
              />
            );

          case ComponentType.UserSelect:
            return (
              <SelectMenu
                key={index}
                type="user-select"
                custom_id={component.custom_id}
                placeholder={component.placeholder}
                options={component.options}
                disabled={component.disabled}
              />
            );

          case ComponentType.RoleSelect:
            return (
              <SelectMenu
                key={index}
                type="role-select"
                custom_id={component.custom_id}
                placeholder={component.placeholder}
                options={component.options}
                disabled={component.disabled}
              />
            );

          case ComponentType.MentionableSelect:
            return (
              <SelectMenu
                key={index}
                type="mentionable-select"
                custom_id={component.custom_id}
                placeholder={component.placeholder}
                options={component.options}
                disabled={component.disabled}
              />
            );

          case ComponentType.ChannelSelect:
            return (
              <SelectMenu
                key={index}
                type="channel-select"
                custom_id={component.custom_id}
                placeholder={component.placeholder}
                options={component.options}
                disabled={component.disabled}
              />
            );

          // Custom component types (non-standard Discord API types)
          case 9: // Section
            return (
              <Section
                key={index}
                entities={entities}
                textComponents={component.components}
                accessory={component.accessory}
              />
            );

          case 12: // MediaGallery
            return <MediaGallery key={index} items={component.items} />;

          // Container component for complex layouts
          default:
            if (component.components && component.components.length > 0) {
              return <Container key={index} entities={entities} component={component} />;
            }

            return (
              <div
                key={index}
                className="border border-dashed border-gray-500 rounded p-2 text-gray-500 text-xs italic my-1"
              >
                Unknown component type: {component.type}
              </div>
            );
        }
      })}
    </div>
  );
};

export default DiscordComponents;
