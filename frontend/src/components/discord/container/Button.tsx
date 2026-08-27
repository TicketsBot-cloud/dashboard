import { isSafeUrl } from "@/lib/url";
import { emojiUrl } from "@/lib/discord-cdn";

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
  switch (style) {
    case 1:
      return "text-white bg-[#4752c4]";
    case 2:
      return "bg-[#4f545c] text-white";
    case 3:
      return "text-white bg-[#2d7d46]";
    case 4:
      return "text-white bg-[#a12d2f]";
    case 5:
      return "bg-[#4f545c] text-white no-underline";
    default:
      return "";
  }
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

  if (button_style === 5 && url && isSafeUrl(url)) {
    return (
      <a
        href={url}
        className={`${baseClasses} ${styleClasses} ${className}`}
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
    <div className={`${baseClasses} ${styleClasses} ${className}`} data-custom-id={custom_id || ""}>
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
