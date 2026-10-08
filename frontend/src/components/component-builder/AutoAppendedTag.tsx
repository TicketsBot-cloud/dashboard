import type { FC, ReactNode } from "react";

interface AutoAppendedTagProps {
  children: ReactNode;
  className?: string;
}

/** Wraps a system-injected element (e.g. the open-ticket button) in the Components v2 preview. */
const AutoAppendedTag: FC<AutoAppendedTagProps> = ({ children, className = "" }) => (
  <div className={`relative opacity-70 pointer-events-none ${className}`}>
    <span className="absolute -top-4 right-0 bg-gray-900 border border-gray-700 text-gray-400 text-[10px] uppercase px-1.5 py-0.5 rounded">
      Added automatically
    </span>
    {children}
  </div>
);

export default AutoAppendedTag;
