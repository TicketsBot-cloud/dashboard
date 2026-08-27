import { emojiUrl } from "@/lib/discord-cdn";

interface SelectMenuProps {
  disabled?: boolean;
  open?: boolean;
  type?: string;
  custom_id?: string;
  placeholder?: string;
  options?: Array<{
    value: string;
    label: string;
    description?: string;
    emoji?: { name: string; id?: string; animated?: boolean };
  }>;
  emoji?: { name: string; id?: string; animated?: boolean } | null;
}

export default function SelectMenu({
  disabled = false,
  open = false,
  type = "string-select",
  custom_id = "",
  placeholder = "Select a topic...",
  options = [],
}: SelectMenuProps) {
  const hasOptions = type === "string-select" && options.length > 0;

  return (
    <div
      className={`relative w-full ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {/* Trigger row */}
      <div className="flex justify-between items-center px-3 py-2.5 bg-[#1e1f22] rounded text-[#949ba4] text-sm">
        <span>{placeholder}</span>
        <i className={`fas fa-chevron-${open && hasOptions ? "up" : "down"} ml-2 text-xs`} />
      </div>

      {/* Options list - always visible when open=true */}
      {open && hasOptions && (
        <div className="mt-1 bg-[#2b2d31] rounded shadow-[0_4px_16px_rgba(0,0,0,0.4)] overflow-hidden">
          {options.map((option, index) => (
            <div
              key={index}
              className="px-3 py-2 flex items-center gap-2 text-sm"
              data-value={option.value}
              data-id={custom_id}
            >
              {option.emoji &&
                (option.emoji.id && option.emoji.id !== "0" ? (
                  <img
                    src={emojiUrl(option.emoji.id, option.emoji.animated ?? false)}
                    alt={option.emoji.name}
                    className="w-5 h-5 shrink-0 object-contain"
                  />
                ) : (
                  <span className="shrink-0">{option.emoji.name}</span>
                ))}
              <div className="flex flex-col min-w-0">
                <span className="text-[#dbdee1] font-medium leading-snug">
                  {option.label || ""}
                </span>
                {option.description && (
                  <span className="text-xs text-[#949ba4] leading-snug mt-0.5">
                    {option.description}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
