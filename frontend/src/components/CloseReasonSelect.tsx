import { useState, type FC } from "react";
import Select from "@/components/Select";
import Textarea from "@/components/Textarea";
import { matchCloseReason } from "@/lib/close-reasons";
import type { PanelCloseReasons } from "@/types";

interface CloseReasonSelectProps {
  closeReasons: PanelCloseReasons;
  value: string;
  onChange: (reason: string) => void;
  label: string;
  hideLabel?: boolean;
  className?: string;
  max: number;
}

const CUSTOM_KEY = "custom";
// Matches no option, so Select falls back to the "Current: …" placeholder.
const CURRENT_KEY = "current";

const CloseReasonSelect: FC<CloseReasonSelectProps> = ({
  closeReasons,
  value,
  onChange,
  label,
  hideLabel,
  className = "",
  max,
}) => {
  const { reasons, allow_custom: allowCustom } = closeReasons;
  const [customPicked, setCustomPicked] = useState(
    () => !!value.trim() && matchCloseReason(reasons, value) === undefined,
  );
  const custom = allowCustom && customPicked;

  const preset = matchCloseReason(reasons, value);
  const selected = custom
    ? CUSTOM_KEY
    : preset !== undefined
      ? String(reasons.indexOf(preset))
      : value.trim()
        ? CURRENT_KEY
        : null;

  const options = reasons.map((reason, i) => ({ key: String(i), label: reason }));
  if (allowCustom) options.push({ key: CUSTOM_KEY, label: "Custom reason" });

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <Select
        className="flex-1"
        label={label}
        hideLabel={hideLabel}
        value={selected}
        options={options}
        onChange={(key) => {
          if (key === CUSTOM_KEY) {
            if (!custom) {
              setCustomPicked(true);
              onChange("");
            }
            return;
          }
          setCustomPicked(false);
          onChange(key === null ? "" : reasons[Number(key)]);
        }}
        showNoneOption
        noneOptionLabel="No reason"
        placeholder={`Current: ${value.trim()}`}
        hideSearch={options.length <= 5}
      />
      {custom && (
        <Textarea
          className="flex-1"
          placeholder="Custom reason"
          value={value}
          onChange={onChange}
          max={max}
        />
      )}
    </div>
  );
};

export default CloseReasonSelect;
