import React, { useEffect, useId, useRef } from "react";

interface ColourSelectProps {
  value: string;
  onChange: (value: string) => void;

  disabled?: boolean;
  className?: string;
  label?: string; // Optional label
}

const ColourSelect: React.FC<ColourSelectProps> = ({
  value,
  onChange,
  disabled = false,
  className = "",
  label,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputId = useId();

  // Sync external value changes into the uncontrolled input
  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(e.target.value), 100);
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label htmlFor={inputId} className="mb-1 text-white">
          {label}
        </label>
      )}
      <div
        className={`inline-flex items-center bg-gray-700 border border-neutral-600 rounded overflow-hidden px-2 min-h-10 ${disabled ? "" : "cursor-pointer"}`}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="color"
          aria-label={label ?? "Select a colour"}
          className="w-full bg-transparent text-white focus:outline-none py-0.75 rounded cursor-pointer disabled:cursor-default [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-none"
          defaultValue={value}
          onChange={handleChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export default ColourSelect;
