import type { FC } from "react";
import { useState, useRef, useEffect, useId, useCallback } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import ChannelInfoModal from "@/components/modals/ChannelInfoModal";
import type { SelectInfo } from "@/constants/panelChannelInfo";
import { useFloatingDropdown } from "@/hooks/useFloatingDropdown";
import { normaliseColour } from "@/lib/colour";

interface SelectOption {
  key: string | null;
  label: string;
  disabled?: boolean;
  color?: string;
}

interface SelectProps {
  value: string | null;
  options: SelectOption[];
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  /** Keep `label` as the accessible name (aria-label/title) without rendering it visibly. */
  hideLabel?: boolean;
  placeholder?: string;
  showNoneOption?: boolean;
  noneOptionLabel?: string;
  hideSearch?: boolean;
  error?: boolean;
  info?: SelectInfo;
}

const defaultProps = {
  disabled: false,
  className: "",
  label: undefined,
  placeholder: "Select a topic...",
  showNoneOption: false,
  noneOptionLabel: "None",
  hideSearch: false,
  error: false,
} as const;

const Select: FC<SelectProps> = (props) => {
  const {
    value,
    onChange,
    options,
    disabled,
    className,
    label,
    hideLabel,
    placeholder,
    showNoneOption,
    noneOptionLabel,
    hideSearch,
    error,
    info,
  } = {
    ...defaultProps,
    ...props,
  };

  const [infoOpen, setInfoOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearchText("");
  }, []);

  const { position: dropdownPosition } = useFloatingDropdown({
    isOpen,
    triggerRef,
    dropdownRef: portalRef,
    onClose: closeDropdown,
    maxHeight: 280,
    minWidth: 0,
    matchTriggerWidth: true,
  });

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const selectOption = (optionKey: string | null) => {
    if (disabled) return;
    onChange(optionKey);
    setIsOpen(false);
    setSearchText("");
  };

  const getSelectedOption = () => {
    if (value === null && showNoneOption) {
      return { key: null, label: noneOptionLabel };
    }
    return options.find((opt) => opt.key === value);
  };

  const selectedOption = getSelectedOption();

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchText.toLowerCase()),
  );

  return (
    <div className={`flex flex-col relative ${className}`}>
      {label && hideLabel && <label className="sr-only">{label}</label>}
      {label && !hideLabel && (
        <div className="mb-1 flex items-center gap-1.5">
          <label className="text-white">{label}</label>
          {info && (
            <button
              type="button"
              className="text-gray-400 hover:text-gray-200 transition-colors"
              aria-label={`Learn more about ${label}`}
              onClick={() => setInfoOpen(true)}
            >
              <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <button
        ref={triggerRef}
        type="button"
        className={`inline-flex items-center bg-gray-700 border rounded overflow-hidden px-1 w-full text-left ${disabled ? "opacity-50" : ""} ${error ? "border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.45)]" : "border-neutral-600"}`}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled) setIsOpen(!isOpen);
          }
        }}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
        aria-owns={isOpen ? listboxId : undefined}
        aria-label={label || "Select"}
        title={label || "Select"}
      >
        <div className="w-full p-2 min-h-10 flex items-center gap-2">
          {selectedOption ? (
            <>
              {selectedOption.color && (
                <div
                  className="w-3 h-3 rounded-full shrink-0 ring-1 ring-white/15"
                  style={{ backgroundColor: normaliseColour(selectedOption.color) }}
                />
              )}
              <span className="text-white">{selectedOption.label}</span>
            </>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
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
      </button>

      {isOpen &&
        !disabled &&
        createPortal(
          <div
            ref={portalRef}
            className="fixed bg-gray-700 border border-neutral-600 rounded shadow-lg z-popover flex flex-col"
            id={listboxId}
            role="listbox"
            aria-label="Select Options"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              maxHeight: dropdownPosition.maxHeight,
            }}
          >
            {!hideSearch && (
              <div className="shrink-0 bg-gray-700 border-b border-gray-600 p-2">
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
            )}
            <div className="overflow-y-auto">
              {showNoneOption &&
                noneOptionLabel.toLowerCase().includes(searchText.toLowerCase()) && (
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === null}
                    className={`flex items-center px-3 py-2 cursor-pointer hover:bg-gray-600 w-full text-left border-b border-gray-600 ${
                      value === null ? "bg-gray-600" : ""
                    }`}
                    onClick={() => selectOption(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectOption(null);
                      }
                    }}
                  >
                    <div
                      className={`w-4 h-4 border border-gray-400 rounded-full mr-3 flex items-center justify-center ${
                        value === null ? "bg-blue-600 border-blue-600" : ""
                      }`}
                    >
                      {value === null && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    <span className="text-gray-400 italic">{noneOptionLabel}</span>
                  </button>
                )}
              {filteredOptions.length > 0
                ? filteredOptions.map((option) => {
                    const isSelected = option.key === value;
                    const isOptionDisabled = option.disabled ?? false;

                    return (
                      <button
                        key={option.key ?? "null"}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`flex items-center px-3 py-2 hover:bg-gray-600 w-full text-left ${
                          isOptionDisabled ? "opacity-50" : ""
                        } ${isSelected ? "bg-gray-600" : ""}`}
                        onClick={() => {
                          if (!isOptionDisabled) selectOption(option.key);
                        }}
                        disabled={isOptionDisabled}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (!isOptionDisabled) selectOption(option.key);
                          }
                        }}
                      >
                        <div
                          className={`w-4 h-4 border border-gray-400 rounded-full mr-3 flex items-center justify-center ${
                            isSelected ? "bg-blue-600 border-blue-600" : ""
                          }`}
                        >
                          {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                        </div>
                        {option.color && (
                          <div
                            className="w-3 h-3 rounded-full mr-2 shrink-0 ring-1 ring-white/15"
                            style={{ backgroundColor: normaliseColour(option.color) }}
                          />
                        )}
                        <span className="text-white">{option.label}</span>
                      </button>
                    );
                  })
                : (!showNoneOption ||
                    !noneOptionLabel.toLowerCase().includes(searchText.toLowerCase())) && (
                    <div className="text-gray-400 text-center py-4">No options found</div>
                  )}
            </div>
          </div>,
          document.body,
        )}

      {info && (
        <ChannelInfoModal
          isOpen={infoOpen}
          onClose={() => setInfoOpen(false)}
          title={info.title}
          description={info.description}
          imageSrc={info.imageSrc}
          imageAlt={info.imageAlt}
        />
      )}
    </div>
  );
};

export default Select;
