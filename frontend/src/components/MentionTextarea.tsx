import { useState, useRef, useEffect, useCallback, useId, useMemo, type FC } from "react";
import { createPortal } from "react-dom";
import type { TicketMember } from "../types";

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  members: TicketMember[];
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  className?: string;
  onSubmit?: () => void;
}

const MENTION_TRIGGER_RE = /@([^\s@>]*)$/;

const MentionTextarea: FC<MentionTextareaProps> = ({
  value,
  onChange,
  members,
  placeholder,
  disabled = false,
  rows = 3,
  className = "",
  onSubmit,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({ bottom: 0, left: 0, width: 0 });

  const instanceId = useId();
  const dropdownId = `mention-dropdown-${instanceId}`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerIndexRef = useRef<number>(-1);

  const filteredMembers = useMemo(
    () => members.filter((member) => member.username.toLowerCase().includes(query.toLowerCase())),
    [members, query],
  );
  const activeIndex =
    filteredMembers.length === 0 ? -1 : Math.min(selectedIndex, filteredMembers.length - 1);
  const selectedMember = activeIndex >= 0 ? filteredMembers[activeIndex] : null;

  const updateDropdownPosition = useCallback(() => {
    if (!textareaRef.current) return;
    const rect = textareaRef.current.getBoundingClientRect();
    setDropdownPosition({
      bottom: window.innerHeight - rect.top + 4,
      left: rect.left,
      width: Math.min(rect.width, 288),
    });
  }, []);

  const detectMention = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const match = MENTION_TRIGGER_RE.exec(textBeforeCursor);

    if (match) {
      triggerIndexRef.current = cursorPos - match[0].length;
      setQuery(match[1]);
      setIsOpen(true);
      updateDropdownPosition();
    } else {
      setIsOpen(false);
    }
  }, [value, updateDropdownPosition]);

  const insertMention = useCallback(
    (member: TicketMember) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart;
      const triggerStart = triggerIndexRef.current;
      // If the user partially deleted a previous mention token (leaving a stray `<`), eat it
      const replaceFrom =
        triggerStart > 0 && value[triggerStart - 1] === "<" ? triggerStart - 1 : triggerStart;
      const mentionToken = `<@${member.id}>`;
      const newValue = value.slice(0, replaceFrom) + mentionToken + value.slice(cursorPos);

      onChange(newValue);
      setIsOpen(false);

      const newCursorPos = replaceFrom + mentionToken.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      });
    },
    [value, onChange],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  // Detect mentions after value or cursor changes
  useEffect(() => {
    detectMention();
  }, [detectMention]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isOpen && selectedMember) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredMembers.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertMention(selectedMember);
          return;
        }
      }

      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
        return;
      }

      if (e.key === "Enter" && !e.shiftKey && !isOpen) {
        if (onSubmit) {
          e.preventDefault();
          onSubmit();
        }
      }
    },
    [isOpen, filteredMembers.length, selectedMember, insertMention, onSubmit],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") return;
      if (isOpen && ["ArrowUp", "ArrowDown", "Enter", "Tab"].includes(e.key)) return;
      detectMention();
    },
    [isOpen, detectMention],
  );

  // Scroll selected item into view
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return;
    const selected = dropdownRef.current.querySelector('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        textareaRef.current &&
        !textareaRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", updateDropdownPosition);
    window.addEventListener("resize", updateDropdownPosition);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", updateDropdownPosition);
      window.removeEventListener("resize", updateDropdownPosition);
    };
  }, [isOpen, updateDropdownPosition]);

  // Reset selected index when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, members]);

  return (
    <>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onClick={detectMention}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={`w-full bg-gray-700 border border-neutral-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none ${className}`}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-controls={isOpen ? dropdownId : undefined}
        aria-activedescendant={
          isOpen && selectedMember ? `${dropdownId}-option-${selectedMember.id}` : undefined
        }
      />
      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            id={dropdownId}
            role="listbox"
            aria-label="Member suggestions"
            className="fixed w-72 max-h-48 overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-popover"
            style={{
              bottom: dropdownPosition.bottom,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
            }}
          >
            {filteredMembers.length > 0 ? (
              filteredMembers.map((member, index) => (
                <div
                  key={member.id}
                  id={`${dropdownId}-option-${member.id}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === activeIndex}
                  data-selected={index === activeIndex}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-700 ${
                    index === activeIndex ? "bg-gray-700" : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(member);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {member.avatar ? (
                    <img
                      src={member.avatar}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      alt=""
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-sm text-gray-300 flex-shrink-0">
                      {member.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm text-white truncate">{member.username}</span>
                    <span className="text-xs text-gray-400 truncate">{member.id}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-sm text-gray-400 text-center" role="status">
                No matching members
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
};

export default MentionTextarea;
