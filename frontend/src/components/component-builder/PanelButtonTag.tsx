import type { FC } from "react";

// Not AutoAppendedTag, whose pointer-events-none would disable the neighbouring picker.
const PanelButtonTag: FC = () => (
  <span className="bg-gray-900 border border-gray-700 text-gray-400 text-[10px] uppercase px-1.5 py-0.5 rounded shrink-0">
    Edited in Panel Customization
  </span>
);

export default PanelButtonTag;
