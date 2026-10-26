import React, { useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan } from "@fortawesome/free-solid-svg-icons";
import { IDLE_INPUT_CLASS } from "@/lib/field-validity";

interface ColourSelectBaseProps {
  disabled?: boolean;
  className?: string;
  label?: string; // Optional label
}

interface SolidColourSelectProps extends ColourSelectBaseProps {
  nullable?: false;
  clearable?: never;
  fallbackColour?: never;
  value: string;
  onChange: (value: string) => void;
}

interface NullableColourSelectProps extends ColourSelectBaseProps {
  nullable: true;
  value: string | null;
  onChange: (value: string | null) => void;
  clearable?: boolean;
  fallbackColour?: string;
}

type ColourSelectProps = SolidColourSelectProps | NullableColourSelectProps;

const ColourSelect: React.FC<ColourSelectProps> = (props) => {
  const { value, disabled = false, className = "", label } = props;
  const clearable = props.nullable && props.clearable;
  const fallbackColour = (props.nullable && props.fallbackColour) || "#5865f2";
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputId = useId();
  const labelId = useId();
  const noneId = useId();
  // Seeded once: tracking value would reset an untouched input to the fallback on clear.
  const [initialColour] = useState(value ?? fallbackColour);

  // Sync external value changes into the uncontrolled input
  useEffect(() => {
    if (value !== null && inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => props.onChange(e.target.value), 100);
  };

  // Picking the input's current colour fires no change event, so commit on click.
  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    if (clearable && value === null) props.onChange(e.currentTarget.value);
  };

  const clear = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!props.nullable) return;
    const hadFocus = document.activeElement === e.currentTarget;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    props.onChange(null);
    // Focusing the input after a tap opens its picker on iOS.
    if (hadFocus) inputRef.current?.focus();
  };

  const isNone = value === null;
  const clearLabel = label
    ? `Clear ${label}${/colour/i.test(label) ? "" : " colour"}`
    : "Clear colour";

  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label id={labelId} htmlFor={inputId} className="mb-1 text-white">
          {label}
        </label>
      )}
      <div
        className={`inline-flex items-center gap-2 bg-gray-700 border ${IDLE_INPUT_CLASS} rounded px-2 min-h-10 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        {/* Overlay, not swap: remounting or restyling the input closes an open picker. */}
        <div className="relative flex flex-1 min-w-0">
          <input
            id={inputId}
            ref={inputRef}
            type="color"
            aria-label={label ?? "Select a colour"}
            aria-labelledby={isNone ? (label ? `${labelId} ${noneId}` : noneId) : undefined}
            className="flex-1 min-w-0 bg-transparent text-white focus:outline-none py-0.75 rounded cursor-pointer disabled:cursor-not-allowed [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-none"
            defaultValue={initialColour}
            onChange={handleChange}
            onClick={handleClick}
            disabled={disabled}
          />
          {isNone && (
            <span
              id={noneId}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center gap-2 rounded bg-gray-700 text-sm text-gray-300"
            >
              <FontAwesomeIcon icon={faBan} />
              No colour
            </span>
          )}
        </div>
        {clearable && !disabled && !isNone && (
          <button
            type="button"
            onClick={clear}
            aria-label={clearLabel}
            title={clearLabel}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-lg leading-none text-gray-400 hover:bg-gray-600 hover:text-white focus-visible:bg-gray-600 focus-visible:text-white"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};

export default ColourSelect;
