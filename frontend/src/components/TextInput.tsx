import { useId, type FC, type KeyboardEvent } from "react";

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  maxLength?: number;
  type?: "text" | "email" | "url" | "tel" | "search" | "date";
  autoComplete?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  error?: string;
  inputMode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";
  pattern?: string;
  descriptionId?: string;
}

const defaultProps = {
  placeholder: "",
  disabled: false,
  className: "",
  label: undefined,
} as const;

const TextInput: FC<TextInputProps> = (props) => {
  const {
    value,
    onChange,
    placeholder,
    disabled,
    className,
    label,
    maxLength,
    type,
    autoComplete,
    onKeyDown,
    onBlur,
    autoFocus,
    error,
    inputMode,
    pattern,
    descriptionId,
  } = {
    ...defaultProps,
    ...props,
  };
  const inputId = useId();
  const errorId = useId();
  const borderClass = error ? "border-red-500" : "border-neutral-600 focus-within:border-blue-500";
  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label htmlFor={inputId} className="mb-1 text-white">
          {label}
        </label>
      )}
      <div className={`inline-flex bg-gray-700 border rounded overflow-hidden px-1 ${borderClass}`}>
        <input
          id={inputId}
          type={type ?? "text"}
          autoComplete={autoComplete}
          className="w-full bg-transparent text-white focus:outline-none p-2"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          autoFocus={autoFocus}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          inputMode={inputMode}
          pattern={pattern}
          aria-describedby={
            [descriptionId, error ? errorId : null].filter(Boolean).join(" ") || undefined
          }
          aria-invalid={error ? true : undefined}
        />
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-red-400 text-xs" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
};

export default TextInput;
