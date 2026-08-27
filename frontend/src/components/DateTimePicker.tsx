import { useId, type FC } from "react";

interface DateTimePickerProps {
  value: Date | null;
  onChange: (value: Date | null) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  placeholder?: string;
  error?: string;
}

function toLocalInputValue(date: Date | null): string {
  if (!date) return "";

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromLocalInputValue(value: string): Date | null {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DateTimePicker: FC<DateTimePickerProps> = ({
  value,
  onChange,
  disabled = false,
  className = "",
  label,
  placeholder,
  error,
}) => {
  const inputId = useId();
  const errorId = useId();
  const borderClass = error
    ? "border-red-500 focus-within:ring-red-500 focus-within:border-red-500"
    : "border-neutral-600 focus-within:ring-blue-500 focus-within:border-blue-500";

  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label htmlFor={inputId} className="mb-1 text-white">
          {label}
        </label>
      )}
      <div
        className={`inline-flex w-full bg-gray-700 border rounded overflow-hidden px-1 focus-within:ring-2 ${borderClass}`}
      >
        <input
          id={inputId}
          type="datetime-local"
          disabled={disabled}
          placeholder={placeholder}
          value={toLocalInputValue(value)}
          onChange={(event) => onChange(fromLocalInputValue(event.target.value))}
          onClick={(event) => {
            if (!disabled) {
              event.currentTarget.showPicker?.();
            }
          }}
          className="w-full min-h-10 bg-transparent p-2 text-white placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark]"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-400" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
};

export default DateTimePicker;
