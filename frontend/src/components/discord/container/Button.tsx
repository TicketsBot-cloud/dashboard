import { isSafeUrl } from "@/lib/url";
import { emojiUrl } from "@/lib/discord-cdn";
import { BUTTON_STYLE_COLOURS } from "@/constants/buttonStyles";

interface ButtonProps {
  button_style?: number;
  custom_id?: string;
  emoji?: { name: string; id?: string; animated?: boolean };
  label?: string;
  url?: string;
  className?: string;
  disabled?: boolean;
}

function convertButtonStyle(style?: number): string {
  if (style === undefined || BUTTON_STYLE_COLOURS[style] === undefined) return "";
  return style === 5 ? "text-white no-underline" : "text-white";
}

export default function Button({
  button_style,
  custom_id,
  emoji,
  label,
  url,
  className,
  disabled,
}: ButtonProps) {
  const baseClasses = `inline-flex items-center justify-center align-middle px-4 h-8 min-w-15 rounded text-sm font-medium select-none transition-colors duration-150 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`;
  const styleClasses = convertButtonStyle(button_style);
  const backgroundStyle = {
    backgroundColor: button_style === undefined ? undefined : BUTTON_STYLE_COLOURS[button_style],
  };

  if (button_style === 5 && url && isSafeUrl(url)) {
    return (
      <a
        href={url}
        className={`${baseClasses} ${styleClasses} ${className}`}
        style={backgroundStyle}
        data-custom-id={custom_id || ""}
        target="_blank"
        rel="noopener noreferrer"
      >
        {emoji &&
          (emoji.id && emoji.id !== "0" ? (
            <img
              src={emojiUrl(emoji.id, emoji.animated ?? false)}
              alt={emoji.name}
              className="w-4.5 h-4.5 mr-2 object-contain"
            />
          ) : (
            <span className="mr-2">{emoji.name}</span>
          ))}
        {label || ""}&nbsp;<i className="fas fa-external-link-alt"></i>
      </a>
    );
  }

  return (
    <div
      className={`${baseClasses} ${styleClasses} ${className}`}
      style={backgroundStyle}
      data-custom-id={custom_id || ""}
    >
      {emoji &&
        (emoji.id && emoji.id !== "0" ? (
          <img
            src={emojiUrl(emoji.id, emoji.animated ?? false)}
            alt={emoji.name}
            className="w-4.5 h-4.5 mr-2 object-contain"
          />
        ) : (
          <span className="mr-2">{emoji.name}</span>
        ))}
      {label || ""}
    </div>
  );
}
