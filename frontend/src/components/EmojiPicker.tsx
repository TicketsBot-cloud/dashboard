import type { FC } from "react";
import { emojiUrl } from "@/lib/discord-cdn";
import { useState, useRef, useEffect, useMemo, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { getEmojisGroupedBy, type BaseEmoji, type GroupedBy } from "unicode-emoji";
import { useFloatingDropdown } from "@/hooks/useFloatingDropdown";
import type { GuildEmoji } from "@/types";

interface EmojiPickerProps {
  value: string;
  guildEmojiId?: string;
  onChange: (value: string, guildEmoji?: GuildEmoji) => void;
  guildEmojis?: GuildEmoji[];
  disabled?: boolean;
  className?: string;
  label?: string;
  placeholder?: string;
}

const defaultProps = {
  disabled: false,
  className: "",
  label: undefined,
  placeholder: "Select an emoji...",
  guildEmojis: [] as GuildEmoji[],
  guildEmojiId: undefined,
} as const;

const groupDisplayNames: Record<string, string> = {
  "smileys-emotion": "Smileys",
  "people-body": "People",
  "animals-nature": "Animals",
  "food-drink": "Food",
  "travel-places": "Travel",
  activities: "Activities",
  objects: "Objects",
  symbols: "Symbols",
  flags: "Flags",
};

const GUILD_CATEGORY = "server";

function guildEmojiUrl(emoji: GuildEmoji) {
  return emojiUrl(emoji.id, !!emoji.animated);
}

const EmojiPicker: FC<EmojiPickerProps> = (props) => {
  const { value, guildEmojiId, onChange, guildEmojis, disabled, className, label, placeholder } = {
    ...defaultProps,
    ...props,
  };

  const hasGuildEmojis = guildEmojis.length > 0;

  // Bundled Twemoji font is Emoji 15.0; hide newer emoji that no shipping font renders yet.
  const emojiData = useMemo(() => getEmojisGroupedBy("group", { versionAbove: "15.0" }), []);
  const groups = useMemo(() => Object.keys(emojiData), [emojiData]);

  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(
    hasGuildEmojis ? GUILD_CATEGORY : groups[0] || "smileys-emotion",
  );
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 400,
  });

  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dialogId = useId();

  const selectedGuildEmoji = guildEmojiId
    ? (guildEmojis.find((e) => e.id === guildEmojiId) ?? null)
    : null;

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearchText("");
  }, []);

  const { position: floatingPosition } = useFloatingDropdown({
    isOpen,
    triggerRef,
    dropdownRef,
    onClose: closeDropdown,
    maxHeight: 400,
    minWidth: 280,
  });

  useEffect(() => {
    setDropdownPosition(floatingPosition);
  }, [floatingPosition]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [isOpen]);

  const selectUnicode = (emoji: string) => {
    onChange(emoji, undefined);
    setIsOpen(false);
    setSearchText("");
  };

  const selectGuild = (emoji: GuildEmoji) => {
    onChange(emoji.name, emoji);
    setIsOpen(false);
    setSearchText("");
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) onChange("", undefined);
  };

  // Build search results: guild emojis first, then unicode
  const searchLower = searchText.toLowerCase();

  const filteredGuild: GuildEmoji[] = searchText
    ? guildEmojis.filter((e) => e.name.toLowerCase().includes(searchLower))
    : selectedCategory === GUILD_CATEGORY
      ? guildEmojis
      : [];

  const filteredUnicode: BaseEmoji[] = searchText
    ? Object.values(emojiData)
        .flat()
        .filter(
          (e) =>
            e.description.toLowerCase().includes(searchLower) ||
            e.keywords.some((k) => k.toLowerCase().includes(searchLower)),
        )
    : selectedCategory !== GUILD_CATEGORY
      ? (emojiData[selectedCategory as GroupedBy] ?? [])
      : [];

  const isEmpty = filteredGuild.length === 0 && filteredUnicode.length === 0;

  const hasValue = !!selectedGuildEmoji || !!value;

  return (
    <div className={`flex flex-col relative ${className}`}>
      {label && <label className="mb-1 text-white">{label}</label>}

      <div
        ref={triggerRef}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        className={`inline-flex items-center bg-gray-700 border border-neutral-600 rounded overflow-hidden px-1 cursor-pointer w-full text-left ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled) setIsOpen(!isOpen);
          }
        }}
        aria-expanded={isOpen}
        aria-controls={isOpen ? dialogId : undefined}
        aria-haspopup="dialog"
        aria-label={label || "Emoji Picker"}
      >
        <div className="w-full p-2 min-h-10 flex items-center justify-between">
          {selectedGuildEmoji ? (
            <img
              src={guildEmojiUrl(selectedGuildEmoji)}
              alt={selectedGuildEmoji.name}
              className="w-6 h-6 object-contain"
            />
          ) : value ? (
            <span className="text-2xl leading-none">{value}</span>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
          {hasValue && !disabled && (
            <button
              type="button"
              onClick={clear}
              className="text-gray-400 hover:text-white ml-2 focus:outline-none"
              aria-label="Clear emoji"
              title="Clear emoji"
            >
              ×
            </button>
          )}
        </div>
        <div className="px-2">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isOpen &&
        !disabled &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed bg-gray-700 border border-neutral-600 rounded shadow-lg z-popover flex flex-col"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              maxHeight: dropdownPosition.maxHeight,
            }}
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-label="Emoji Picker"
          >
            {/* Search */}
            <div className="sticky top-0 bg-gray-700 border-b border-gray-600 p-2">
              <input
                ref={searchInputRef}
                type="text"
                aria-label="Search emojis"
                title="Search emojis"
                className="w-full bg-gray-800 text-white px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                placeholder="Search emojis..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsOpen(false);
                    setSearchText("");
                  }
                  e.stopPropagation();
                }}
              />
            </div>

            {/* Category tabs - hidden while searching */}
            {!searchText && (
              <div className="flex border-b border-gray-600 overflow-x-auto bg-gray-700 min-h-10">
                {hasGuildEmojis && (
                  <button
                    type="button"
                    className={`px-3 py-1 text-sm whitespace-nowrap transition-colors min-h-8 flex items-center ${
                      selectedCategory === GUILD_CATEGORY
                        ? "bg-gray-600 text-white border-b-2 border-blue-500"
                        : "text-gray-400 hover:text-white hover:bg-gray-600"
                    }`}
                    onClick={() => setSelectedCategory(GUILD_CATEGORY)}
                    title="Discord emojis"
                  >
                    Discord
                  </button>
                )}
                {groups.map((group) => (
                  <button
                    key={group}
                    type="button"
                    className={`px-3 py-1 text-sm whitespace-nowrap transition-colors min-h-8 flex items-center ${
                      selectedCategory === group
                        ? "bg-gray-600 text-white border-b-2 border-blue-500"
                        : "text-gray-400 hover:text-white hover:bg-gray-600"
                    }`}
                    onClick={() => setSelectedCategory(group)}
                    title={groupDisplayNames[group] || group}
                  >
                    {groupDisplayNames[group] || group}
                  </button>
                ))}
              </div>
            )}

            {/* Emoji grid */}
            <div className="flex-1 overflow-y-auto p-2">
              {isEmpty ? (
                <div className="text-gray-400 text-center py-4">No emojis found</div>
              ) : (
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-1">
                  {filteredGuild.map((emoji) => (
                    <button
                      key={`guild-${emoji.id}`}
                      type="button"
                      title={`:${emoji.name}:`}
                      className={`p-1 sm:p-2 hover:bg-gray-600 rounded transition-colors flex items-center justify-center ${guildEmojiId === emoji.id ? "bg-gray-600 ring-1 ring-blue-500" : ""}`}
                      onClick={() => selectGuild(emoji)}
                    >
                      <img
                        src={guildEmojiUrl(emoji)}
                        alt={emoji.name}
                        className="w-6 h-6 object-contain"
                      />
                    </button>
                  ))}
                  {filteredUnicode.map((e, index) => (
                    <button
                      key={`unicode-${e.emoji}-${index}`}
                      type="button"
                      title={e.description}
                      className="p-1 sm:p-2 text-xl hover:bg-gray-600 rounded transition-colors flex items-center justify-center"
                      onClick={() => selectUnicode(e.emoji)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          selectUnicode(e.emoji);
                        }
                      }}
                    >
                      {e.emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default EmojiPicker;
