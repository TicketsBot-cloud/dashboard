import { useId, type FC } from "react";
import RequiredMark from "./RequiredMark";
import {
  FAULT_FIELD_CLASS,
  IDLE_INPUT_CLASS,
  MISSING_FIELD_CLASS,
  isBlank,
} from "@/lib/field-validity";

interface TextareaProps {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max: number;
  disabled?: boolean;
  className?: string;
  label?: string;
  placeholder?: string;
  onBlur?: () => void;
  error?: string;
  required?: boolean;
  missing?: boolean;
}

const defaultProps = {
  min: 0,
  disabled: false,
  className: "",
  label: undefined,
  required: false,
} as const;

const Textarea: FC<TextareaProps> = (props) => {
  const { value, onChange, min, max, disabled, className, label, placeholder, required } = {
    ...defaultProps,
    ...props,
  };
  const textareaId = useId();
  const errorId = useId();
  const countId = useId();
  const { onBlur, error } = props;
  const safeValue = value ?? "";
  const missing = !disabled && (props.missing ?? (required && isBlank(safeValue)));
  const borderClass = error
    ? FAULT_FIELD_CLASS
    : missing
      ? MISSING_FIELD_CLASS
      : IDLE_INPUT_CLASS;
  const describedBy = [error ? errorId : null, countId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label htmlFor={textareaId} className="mb-1 text-white">
          {label}
          {required && <RequiredMark />}
        </label>
      )}
      <div
        className={`inline-flex items-center bg-gray-700 border rounded px-1 ${borderClass}`}
        data-missing={missing || !!error || undefined}
        data-bloom={error ? true : undefined}
      >
        <textarea
          id={textareaId}
          className="w-full bg-gray-700 p-3 rounded resize-y h-50 focus:outline-none"
          value={safeValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          minLength={min}
          maxLength={max}
          placeholder={placeholder || ""}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy}
        />
      </div>
      <div className="flex items-center justify-between">
        {error ? (
          <p id={errorId} className="mt-1 text-red-400 text-xs" aria-live="polite">
            {error}
          </p>
        ) : (
          <span />
        )}
        <span id={countId} className="text-xs mt-1">
          {[...safeValue].length}/{max}
        </span>
      </div>
    </div>
  );
};

export default Textarea;
