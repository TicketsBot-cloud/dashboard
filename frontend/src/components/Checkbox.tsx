import { useId, useEffect, useRef, type FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faMinus } from "@fortawesome/free-solid-svg-icons";

export type CheckboxLabelPosition = "top" | "bottom" | "left" | "right";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  indeterminate?: boolean;
  disabled?: boolean;
  label?: string;
  labelPosition?: CheckboxLabelPosition;
  ariaLabel?: string;
  className?: string;
}

const directionClasses: Record<CheckboxLabelPosition, string> = {
  right: "flex-row",
  left: "flex-row-reverse",
  bottom: "flex-col",
  top: "flex-col-reverse",
};

const Checkbox: FC<CheckboxProps> = ({
  checked,
  onChange,
  indeterminate = false,
  disabled = false,
  label,
  labelPosition = "right",
  ariaLabel,
  className = "",
}) => {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label
      htmlFor={id}
      className={`${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${className}`}
    >
      <span className={`inline-flex items-center gap-2 ${directionClasses[labelPosition]}`}>
        <input
          ref={ref}
          id={id}
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          aria-label={ariaLabel}
        />
        <span className="w-4 h-4 shrink-0 rounded border border-gray-500 bg-gray-700 flex items-center justify-center text-[10px] transition-colors peer-checked:bg-blue-600 peer-checked:border-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-gray-800">
          {indeterminate ? (
            <FontAwesomeIcon icon={faMinus} className="text-white" aria-hidden="true" />
          ) : (
            <FontAwesomeIcon
              icon={faCheck}
              className={`text-white ${checked ? "" : "invisible"}`}
              aria-hidden="true"
            />
          )}
        </span>
        {label && <span className="text-white text-sm select-none">{label}</span>}
      </span>
    </label>
  );
};

export default Checkbox;
