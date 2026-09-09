import type { FC } from "react";
import { useState, useRef, useEffect, useId, useCallback } from "react";
import { createPortal } from "react-dom";
import { useFloatingDropdown } from "@/hooks/useFloatingDropdown";
import { normaliseColour } from "@/lib/colour";

interface MultiSelectOption {
  key: string;
  label: string;
  disabled?: boolean;
  color?: string;
}

interface MultiSelectProps {
  value: string[];
  options: MultiSelectOption[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  placeholder?: string;
}

const defaultProps = {
  disabled: false,
  className: "",
  label: undefined,
  placeholder: "Select options...",
} as const;

const MultiSelect: FC<MultiSelectProps> = (props) => {
  const { value, onChange, options, disabled, className, label, placeholder } = {
    ...defaultProps,
    ...props,
  };

  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearchText("");
  }, []);

  const { position: dropdownPosition } = useFloatingDropdown({
    isOpen,
    triggerRef,
    dropdownRef,
    onClose: closeDropdown,
    maxHeight: 280,
    minWidth: 280,
  });

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const toggleOption = (optionKey: string) => {
    if (disabled) return;

    const newValue = value.includes(optionKey)
      ? value.filter((v) => v !== optionKey)
      : [...value, optionKey];

    onChange(newValue);
  };

  const removeOption = (optionKey: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (disabled) return;
    onChange(value.filter((v) => v !== optionKey));
  };

  const getSelectedOptions = () => {
    return value
      .map((v) => options.find((opt) => opt.key === v))
      .filter((opt): opt is MultiSelectOption => opt !== undefined);
  };

  const selectedOptions = getSelectedOptions();

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchText.toLowerCase()),
  );

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
        aria-controls={isOpen ? listboxId : undefined}
        aria-owns={isOpen ? listboxId : undefined}
        aria-haspopup="listbox"
        aria-label={label || "Multi-select"}
      >
        <div className="w-full p-2 min-h-10 flex flex-wrap gap-1 items-center">
          {selectedOptions.length > 0 ? (
            selectedOptions.map((selectedOption) => {
              const swatch = selectedOption.color && normaliseColour(selectedOption.color);
              const fadedBgStyle = swatch
                ? { backgroundColor: `color-mix(in srgb, ${swatch} 20%, transparent)` }
                : {};

              return (
                <span
                  key={selectedOption.key}
                  className="inline-flex items-center max-w-full min-w-0 bg-gray-600 text-white text-sm px-2 py-1 rounded gap-1"
                  style={fadedBgStyle}
                  title={selectedOption.label}
                >
                  {swatch && (
                    <div
                      className="w-3 h-3 rounded-full mr-1 shrink-0 ring-1 ring-white/15"
                      style={{ backgroundColor: swatch }}
                    />
                  )}
                  <span className="min-w-0 truncate">{selectedOption.label}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => removeOption(selectedOption.key, e)}
                      className="text-gray-300 hover:text-white ml-1 shrink-0 focus:outline-none"
                      aria-label={`Remove ${selectedOption.label}`}
                      title={`Remove ${selectedOption.label}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </div>

        <div className="px-2 shrink-0">
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
            className="fixed bg-gray-700 border border-neutral-600 rounded shadow-lg z-popover overflow-y-auto"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              maxHeight: dropdownPosition.maxHeight,
            }}
            id={listboxId}
            role="listbox"
            aria-label="Options"
          >
            <div className="sticky top-0 bg-gray-700 border-b border-gray-600 p-2">
              <input
                ref={searchInputRef}
                type="text"
                aria-label="Search options"
                title="Search options"
                className="w-full bg-gray-800 text-white px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                placeholder="Search options..."
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
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = value.includes(option.key);
                const isOptionDisabled = option.disabled ?? false;

                return (
                  <button
                    key={option.key}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`flex items-start px-3 py-2 hover:bg-gray-600 w-full text-left ${
                      isOptionDisabled ? "opacity-50" : ""
                    } ${isSelected ? "bg-gray-600" : ""}`}
                    onClick={() => {
                      if (!isOptionDisabled) toggleOption(option.key);
                    }}
                    disabled={isOptionDisabled}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (!isOptionDisabled) toggleOption(option.key);
                      }
                    }}
                  >
                    <div
                      className={`w-4 h-4 mt-0.5 shrink-0 border border-gray-400 rounded mr-3 flex items-center justify-center ${
                        isSelected ? "bg-blue-600 border-blue-600" : ""
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                    {option.color && (
                      <div
                        className="w-3 h-3 mt-1.5 shrink-0 rounded-full mr-2 ring-1 ring-white/15"
                        style={{ backgroundColor: normaliseColour(option.color) }}
                      />
                    )}
                    <span className="min-w-0 flex-1 break-words text-white">{option.label}</span>
                  </button>
                );
              })
            ) : (
              <div className="text-gray-400 text-center py-4">No options found</div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};

export default MultiSelect;
