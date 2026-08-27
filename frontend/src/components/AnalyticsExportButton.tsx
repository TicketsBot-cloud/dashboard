import type { FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";

interface AnalyticsExportButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

const AnalyticsExportButton: FC<AnalyticsExportButtonProps> = ({
  onClick,
  disabled = false,
  className = "",
}) => (
  <Button
    variant="secondary"
    onClick={onClick}
    disabled={disabled}
    aria-label="Export analytics"
    className={`gap-1.5 rounded-lg text-sm ${className}`}
  >
    <FontAwesomeIcon icon={faDownload} aria-hidden="true" />
    <span>Export</span>
  </Button>
);

export default AnalyticsExportButton;
