import type { FC } from "react";

interface PanelButtonTagProps {
  label?: string;
  className?: string;
}

/** Badge marking a button as bound to a ticket panel. Not AutoAppendedTag, whose pointer-events-none would disable the neighbouring picker. */
const PanelButtonTag: FC<PanelButtonTagProps> = ({ label, className = "" }) => (
  <span
    className={`bg-gray-900 border border-gray-700 text-gray-400 text-[10px] uppercase px-1.5 py-0.5 rounded shrink-0 ${className}`}
  >
    {label ? `${label} - edited in Panel Customization` : "Edited in Panel Customization"}
  </span>
);

export default PanelButtonTag;
