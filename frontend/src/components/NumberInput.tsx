import { useId, type FC, type ChangeEvent } from "react";

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  label?: string;
  onBlur?: () => void;
  error?: string;
}

const defaultProps = {
  min: Number.MIN_SAFE_INTEGER,
  max: Number.MAX_SAFE_INTEGER,
  step: 1,
  disabled: false,
  className: "",
  label: undefined,
  placeholder: undefined,
} as const;

const NumberInput: FC<NumberInputProps> = (props) => {
  const { value, onChange, min, max, disabled, className, label, placeholder } = {
    ...defaultProps,
    ...props,
  };

  const handleDecrement = () => {
    if (disabled) return;
    if (value - 1 < min) return;
    onChange(value - 1);
  };

  const handleIncrement = () => {
    if (disabled) return;
    if (value + 1 > max) return;
    onChange(value + 1);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val)) {
      val = min;
    }
    val = Math.max(min, Math.min(max, val));
    onChange(val);
  };

  const inputId = useId();
  const errorId = useId();
  const { onBlur, error } = props;
  const borderClass = error ? "border-red-500" : "border-neutral-600 focus-within:border-blue-500";
  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label htmlFor={inputId} className="mb-1 text-white">
          {label}
        </label>
      )}
      <div className={`inline-flex items-center bg-gray-700 border rounded px-1 ${borderClass}`}>
        <button
          type="button"
          aria-label="Decrease"
          title="Decrease"
          onClick={handleDecrement}
          disabled={disabled || value <= min}
          className="px-3 py-1 bg-gray-500 hover:bg-gray-600 active:bg-gray-500 disabled:opacity-50 rounded"
        >
          –
        </button>
        <input
          id={inputId}
          type="text"
          role="spinbutton"
          inputMode="numeric"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className="text-center w-full bg-transparent text-white focus:outline-none py-2"
          value={value}
          onChange={handleChange}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={placeholder || "Enter number"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="button"
          aria-label="Increase"
          title="Increase"
          onClick={handleIncrement}
          disabled={disabled || value >= max}
          className="px-3 py-1 bg-gray-500 hover:bg-gray-600 disabled:opacity-50 rounded"
        >
          +
        </button>
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-red-400 text-xs" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
};

export default NumberInput;
