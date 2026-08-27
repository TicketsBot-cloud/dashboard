import { useId, type FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";

export type SliderLabelPosition = "top" | "left";

interface SliderProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  labelPosition?: SliderLabelPosition;
  ariaLabel?: string;
  /**
   * Forwarded to the underlying checkbox's aria-describedby, e.g. to point a
   * locked slider at the FeatureLockBanner explaining why it's disabled. Note
   * this only reaches virtual-cursor/browse-mode screen reader users: a
   * natively `disabled` control is removed from the tab order, so it is never
   * reached by sequential keyboard navigation.
   */
  ariaDescribedBy?: string;
  onInfoClick?: () => void;
}

const defaultProps = {
  disabled: false,
  className: "",
  label: undefined,
  labelPosition: "top",
} as const;

const Slider: FC<SliderProps> = (props) => {
  const {
    value,
    onChange,
    disabled,
    className,
    label,
    labelPosition,
    ariaLabel,
    ariaDescribedBy,
    onInfoClick,
  } = {
    ...defaultProps,
    ...props,
  };
  const inputId = useId();
  const stacked = labelPosition === "top";

  return (
    <label
      htmlFor={inputId}
      className={`flex w-fit ${stacked ? "flex-col" : "flex-row items-center gap-2"} ${
        disabled ? "cursor-not-allowed" : "cursor-pointer"
      } ${className}`.trim()}
    >
      {label && (
        <span className={`flex items-center gap-1.5 text-white${stacked ? " mb-1" : ""}`}>
          {label}
          {onInfoClick && (
            <button
              type="button"
              className="text-gray-400 hover:text-gray-200 transition-colors"
              aria-label={`Learn more about ${label}`}
              onClick={(e) => {
                e.preventDefault();
                onInfoClick();
              }}
            >
              <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </span>
      )}
      <input
        id={inputId}
        type="checkbox"
        className="sr-only peer"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={label ? undefined : (ariaLabel ?? "Toggle setting")}
        aria-describedby={ariaDescribedBy}
      />
      <span className="relative w-15 h-8 bg-gray-400 rounded-full peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 dark:bg-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:inset-s-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-7 after:w-7 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600 peer-disabled:opacity-50"></span>
    </label>
  );
};

export default Slider;
