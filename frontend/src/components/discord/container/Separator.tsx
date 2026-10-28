interface SeparatorProps {
  divider?: boolean;
  spacing?: number;
}

export default function Separator({ divider = true, spacing = 1 }: SeparatorProps) {
  return (
    <div className={`w-full max-w-130 ${spacing === 2 ? "py-3" : "py-1"}`}>
      {divider && <div className="h-px w-full bg-gray-600/50" />}
    </div>
  );
}
