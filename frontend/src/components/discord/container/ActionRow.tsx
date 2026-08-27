import Button from "./Button";
import SelectMenu from "./SelectMenu";

interface ActionRowProps {
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
  }>;
}

export default function ActionRow({ components = [] }: ActionRowProps) {
  return (
    <div className="flex flex-row items-center gap-2 mb-2 flex-wrap max-w-130">
      {components && components.length > 0 && (
        <>
          {components.map((component, index) => {
            if (component.type === 2) {
              return (
                <Button
                  key={index}
                  button_style={component.style}
                  custom_id={component.custom_id}
                  emoji={component.emoji}
                  label={component.label}
                />
              );
            } else if (component.type === 3) {
              return (
                <SelectMenu
                  key={index}
                  type="string-select"
                  custom_id={component.custom_id}
                  placeholder={component.placeholder}
                  options={component.options}
                  emoji={component.emoji}
                />
              );
            } else if (component.type === 5) {
              return (
                <SelectMenu
                  key={index}
                  type="user-select"
                  custom_id={component.custom_id}
                  placeholder={component.placeholder}
                  options={component.options}
                  emoji={component.emoji}
                />
              );
            } else {
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
        </>
      )}
    </div>
  );
}
