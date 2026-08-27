import type { FC, ChangeEvent, KeyboardEvent, WheelEvent } from "react";

interface DurationPickerProps {
  value: number; // total seconds
  onChange: (seconds: number) => void;
  label?: string;
  disabled?: boolean;
  maxDays?: number;
}

const MAX_HOURS = 23;
const MAX_MINUTES = 59;

function toSeconds(days: number, hours: number, minutes: number): number {
  return days * 86400 + hours * 3600 + minutes * 60;
}

function fromSeconds(total: number): [number, number, number] {
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return [days, hours, minutes];
}

function formatSummary(days: number, hours: number, minutes: number): string {
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.length > 0 ? parts.join(" ") : "Disabled";
}

interface UnitInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}

const UnitInput: FC<UnitInputProps> = ({ label, value, min, max, disabled, onChange }) => {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const parsed = parseInt(e.target.value, 10);
    onChange(isNaN(parsed) ? min : clamp(parsed));
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onChange(clamp(value + 1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onChange(clamp(value - 1));
    }
  };

  const handleWheel = (e: WheelEvent<HTMLInputElement>) => {
    if (document.activeElement !== e.currentTarget) return;
    e.preventDefault();
    onChange(clamp(value + (e.deltaY < 0 ? 1 : -1)));
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="w-full flex items-center justify-center h-7 rounded bg-gray-600 hover:bg-gray-500 active:bg-gray-400 disabled:opacity-30 text-white text-sm leading-none transition-colors"
        aria-label={`Increase ${label}`}
        title={`Increase ${label}`}
      >
        ▲
      </button>

      <input
        type="text"
        inputMode="numeric"
        value={String(value).padStart(2, "0")}
        onChange={handleChange}
        onKeyDown={handleKey}
        onWheel={handleWheel}
        disabled={disabled}
        className="w-full text-center bg-gray-700 border border-neutral-600 rounded text-white text-lg font-mono py-1.5 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={label}
      />

      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="w-full flex items-center justify-center h-7 rounded bg-gray-600 hover:bg-gray-500 active:bg-gray-400 disabled:opacity-30 text-white text-sm leading-none transition-colors"
        aria-label={`Decrease ${label}`}
        title={`Decrease ${label}`}
      >
        ▼
      </button>

      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
    </div>
  );
};

const DurationPicker: FC<DurationPickerProps> = ({
  value,
  onChange,
  label,
  disabled = false,
  maxDays = 30,
}) => {
  const [days, hours, minutes] = fromSeconds(value);

  const update = (d: number, h: number, m: number) => {
    onChange(toSeconds(d, h, m));
  };

  const summary = formatSummary(days, hours, minutes);
  const isEmpty = value === 0;

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-white text-sm font-medium">{label}</span>
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded-full ${
              isEmpty
                ? "bg-gray-700 text-gray-400 border border-transparent"
                : "bg-blue-900/50 text-blue-300 border border-blue-700/50"
            }`}
          >
            {summary}
          </span>
        </div>
      )}

      <div className="bg-gray-800 border border-neutral-600 rounded-lg p-3">
        <div className="grid grid-cols-3 gap-2">
          <UnitInput
            label="Days"
            value={days}
            min={0}
            max={maxDays}
            disabled={disabled}
            onChange={(d) => update(d, hours, minutes)}
          />
          <UnitInput
            label="Hours"
            value={hours}
            min={0}
            max={MAX_HOURS}
            disabled={disabled}
            onChange={(h) => update(days, h, minutes)}
          />
          <UnitInput
            label="Minutes"
            value={minutes}
            min={0}
            max={MAX_MINUTES}
            disabled={disabled}
            onChange={(m) => update(days, hours, m)}
          />
        </div>

        <button
          type="button"
          title="Clear"
          disabled={disabled}
          onClick={() => onChange(0)}
          className={`mt-3 w-full text-xs text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50 ${isEmpty ? "invisible" : ""}`}
        >
          Reset to disabled
        </button>
      </div>
    </div>
  );
};

export default DurationPicker;
