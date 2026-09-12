import type { FC } from "react";
import { intToColour } from "@/lib/colour";

interface LabelBadgeProps {
  name: string;
  colour: number;
  removable?: boolean;
  onRemove?: () => void;
}

const LabelBadge: FC<LabelBadgeProps> = ({ name, colour, removable, onRemove }) => {
  const hex = intToColour(colour);

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-medium leading-none whitespace-nowrap text-white"
      style={{
        background: `color-mix(in srgb, ${hex} 20%, transparent)`,
        border: `1px solid color-mix(in srgb, ${hex} 40%, transparent)`,
      }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: hex }} />
      <span>{name}</span>
      {removable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="flex items-center justify-center ml-0.5 text-[11px] opacity-70 hover:opacity-100 cursor-pointer"
          title="Remove label"
          aria-label={`Remove ${name} label`}
        >
          &times;
        </button>
      )}
    </span>
  );
};

export default LabelBadge;
