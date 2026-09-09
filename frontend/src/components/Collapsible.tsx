import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useId, useState } from "react";

interface CollapsibleProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export default function Collapsible(props: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = useState(props.defaultOpen ?? false);
  const isOpen = props.open ?? internalOpen;
  const contentId = useId();

  const toggleCollapsible = () => {
    const nextOpen = !isOpen;
    if (props.open === undefined) {
      setInternalOpen(nextOpen);
    }
    props.onOpenChange?.(nextOpen);
  };

  return (
    <div className="mb-4 bg-gray-800 rounded-xl overflow-hidden">
      <button
        type="button"
        className={`w-full flex items-center justify-between p-4 text-left hover:bg-gray-700 active:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset rounded-t-2xl cursor-pointer bg-transparent border-none text-inherit ${!isOpen && "rounded-b-2xl"}`}
        onClick={toggleCollapsible}
        title={isOpen ? `Collapse ${props.title}` : `Expand ${props.title}`}
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        <div className="flex flex-col gap-1">
          {props.title && (
            <h2 className="text-xl font-medium capitalize">{props.title.toLowerCase()}</h2>
          )}
          {props.subtitle && (
            <p className="text-xs lowercase first-letter:uppercase">{props.subtitle}</p>
          )}
        </div>
        <FontAwesomeIcon icon={isOpen ? faChevronUp : faChevronDown} aria-hidden="true" />
      </button>
      <div
        id={contentId}
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
        aria-hidden={!isOpen}
        {...(!isOpen ? { inert: true } : {})}
      >
        <div className="relative overflow-hidden min-h-0">
          {isOpen && <hr className="text-gray-700" />}
          <div className="p-4">{props.children}</div>
        </div>
      </div>
    </div>
  );
}
