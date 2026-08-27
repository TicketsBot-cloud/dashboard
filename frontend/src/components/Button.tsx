import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";

export type ButtonVariant =
  "primary" | "danger" | "secondary" | "success" | "purple" | "ghost" | "outline" | "dashed";
type ButtonSize = "sm" | "md" | "icon";

interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled" | "onClick" | "type"
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  isLoading?: boolean;
  /**
   * Disables the button without pulling it out of the tab order: the native
   * `disabled` attribute is never set, `aria-disabled` is set instead, and the
   * click handler no-ops rather than every call site having to remember to guard
   * it. Use this over `disabled` when a focusable-but-inert control is required,
   * e.g. a save button next to a banner explaining why it currently does nothing.
   */
  visuallyDisabled?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit" | "reset";
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 hover:bg-blue-700 text-white",
  danger: "bg-red-600 hover:bg-red-700 text-white",
  secondary: "bg-gray-600 hover:bg-gray-700 text-white",
  success: "bg-green-600 hover:bg-green-700 text-white",
  purple: "bg-purple-500 hover:bg-purple-600 text-white",
  ghost: "bg-transparent text-blue-400 hover:text-blue-300",
  outline:
    "bg-transparent border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white",
  dashed:
    "bg-transparent border border-dashed border-gray-600 text-blue-400 hover:border-gray-500 hover:text-blue-300",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "py-1 px-2.5 text-xs",
  md: "py-2 px-4",
  icon: "p-1.5",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant,
      size = "md",
      disabled = false,
      isLoading = false,
      visuallyDisabled = false,
      onClick,
      type = "button",
      className = "",
      children,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        onClick={(event) => {
          if (visuallyDisabled) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
        disabled={disabled || isLoading}
        aria-disabled={visuallyDisabled || undefined}
        aria-busy={isLoading || undefined}
        className={`inline-flex items-center justify-center gap-1 rounded transition-colors active:scale-[0.98] disabled:opacity-50 ${
          visuallyDisabled
            ? // Fixed colour pair, not the generic opacity-50 treatment: opacity
              // composited over the page background (bg-gray-900) drops any variant's
              // label contrast to roughly 2.3:1, well under the 4.5:1 AA minimum, and
              // this button is deliberately kept focusable rather than exempt as an
              // inactive control. bg-gray-700/text-gray-300 measures ~7:1 on
              // bg-gray-900, independent of whichever variant is passed in.
              "bg-gray-700 text-gray-300 cursor-not-allowed"
            : variant
              ? variantClasses[variant]
              : "text-white"
        } ${sizeClasses[size]} ${className}`}
        {...rest}
      >
        {isLoading && (
          <>
            <svg
              className="animate-spin h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="sr-only">Loading,</span>
          </>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

export default Button;
