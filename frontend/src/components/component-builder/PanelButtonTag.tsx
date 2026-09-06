import type { FC } from "react";

interface PanelButtonTagProps {
  /** Resolved panel display name, shown alongside the static message when known. */
  label?: string;
  className?: string;
}

/**
 * Small inline badge marking a button/accessory as bound to a ticket panel, editable from Panel
 * Customization rather than here. Deliberately not a reuse of AutoAppendedTag: that component
 * wraps its children in `opacity-70 pointer-events-none`, which is right for a genuinely
 * read-only system-injected preview but would wrongly disable the still-interactive panel
 * picker/remove controls sitting next to this tag. This is a plain label, not a wrapper - it
 * renders no children of its own.
 */
const PanelButtonTag: FC<PanelButtonTagProps> = ({ label, className = "" }) => (
  <span
    className={`bg-gray-900 border border-gray-700 text-gray-400 text-[10px] uppercase px-1.5 py-0.5 rounded shrink-0 ${className}`}
  >
    {label ? `${label} - edited in Panel Customization` : "Edited in Panel Customization"}
  </span>
);

export default PanelButtonTag;
