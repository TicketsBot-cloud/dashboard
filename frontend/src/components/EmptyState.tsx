import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import Button from "@/components/Button";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: IconDefinition;
}

interface EmptyStateProps {
  icon: IconDefinition;
  title: string;
  description: string | ReactNode;
  action?: EmptyStateAction;
  className?: string;
  headingLevel?: "h2" | "h3" | "h4";
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
  headingLevel: Heading = "h3",
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 ${className}`}>
      <FontAwesomeIcon icon={icon} className="text-gray-600 text-5xl mb-4" aria-hidden="true" />
      <Heading className="text-lg text-white font-semibold mb-1">{title}</Heading>
      <p className="text-sm text-gray-300 text-center max-w-md mb-4">{description}</p>
      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {action.icon && <FontAwesomeIcon icon={action.icon} aria-hidden="true" />}
          {action.label}
        </Button>
      )}
    </div>
  );
}
