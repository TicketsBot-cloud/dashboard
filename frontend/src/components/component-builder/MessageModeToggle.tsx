import { useId, type FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faListUl, faLayerGroup, faCheck, faCrown } from "@fortawesome/free-solid-svg-icons";

export type MessageMode = "classic" | "components_v2";

interface MessageModeToggleProps {
  mode: MessageMode;
  onChange: (mode: MessageMode) => void;
  isPremium: boolean;
  canEnterV2?: boolean;
  disabled?: boolean;
  legendSuffix?: string;
}

const OPTIONS: { mode: MessageMode; icon: typeof faListUl; title: string; description: string }[] =
  [
    {
      mode: "classic",
      icon: faListUl,
      title: "Classic",
      description: "A single coloured embed with a title, description and fields.",
    },
    {
      mode: "components_v2",
      icon: faLayerGroup,
      title: "Components v2",
      description: "Build the message block by block, in any order you like.",
    },
  ];

const MessageModeToggle: FC<MessageModeToggleProps> = ({
  mode,
  onChange,
  isPremium,
  canEnterV2 = true,
  disabled,
  legendSuffix,
}) => {
  const name = useId();

  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-medium text-gray-300 mb-2">
        Message format
        {legendSuffix && <span className="sr-only"> ({legendSuffix})</span>}
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OPTIONS.map((option) => {
          const isV2 = option.mode === "components_v2";
          const locked = isV2 && !isPremium;
          const selected = mode === option.mode;
          const unavailable = isV2 && !canEnterV2 && !selected;
          // Only the icon and description dim, so the label and Premium badge keep full contrast.
          const dim = !selected && (locked || unavailable) ? "opacity-50" : "";

          return (
            <label
              key={option.mode}
              className={`relative flex items-start gap-3 p-3 rounded-lg border transition-colors focus-within:ring-2 focus-within:ring-blue-500 ${
                selected
                  ? `border-blue-500 bg-blue-500/10 ${locked ? "cursor-not-allowed" : "cursor-pointer"}`
                  : locked || unavailable
                    ? "border-gray-700 bg-gray-800 cursor-not-allowed"
                    : "border-gray-700 bg-gray-800 hover:border-gray-600 cursor-pointer"
              }`}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={selected}
                disabled={locked || unavailable}
                onChange={() => onChange(option.mode)}
              />
              {locked && (
                <span
                  className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-400"
                  title="Components v2 messages require Premium or Whitelabel."
                >
                  <FontAwesomeIcon icon={faCrown} aria-hidden="true" />
                  Premium
                  <span className="sr-only">
                    (requires Premium or Whitelabel - unavailable on your current plan)
                  </span>
                </span>
              )}
              <div
                className={`flex items-center justify-center w-9 h-9 rounded shrink-0 ${dim} ${
                  selected ? "bg-blue-500/20 text-blue-400" : "bg-gray-700 text-gray-400"
                }`}
              >
                <FontAwesomeIcon icon={option.icon} aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  {option.title}
                  {selected && (
                    <FontAwesomeIcon
                      icon={faCheck}
                      className="text-blue-400 text-xs"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <p className={`text-xs text-gray-400 mt-0.5 ${dim}`}>{option.description}</p>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
};

export default MessageModeToggle;
