interface TagBadgeProps {
  label: string;
  className?: string;
}

/**
 * Plain, colourless tag pill. `LabelBadge` requires a `colour: number` (it
 * renders ticket labels), which flag tags do not have, so this is its own
 * small component rather than a reuse.
 */
export default function TagBadge({ label, className = "" }: TagBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-300 whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}
