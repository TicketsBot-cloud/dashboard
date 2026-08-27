import type { FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";

interface ModalCloseButtonProps {
  onClose: () => void;
  className?: string;
}

const ModalCloseButton: FC<ModalCloseButtonProps> = ({ onClose, className = "" }) => (
  <Button
    variant="ghost"
    size="icon"
    type="button"
    onClick={onClose}
    className={`absolute top-4 right-4 text-gray-400 hover:text-white ${className}`}
    aria-label="Close"
  >
    <FontAwesomeIcon icon={faXmark} className="text-lg" />
  </Button>
);

export default ModalCloseButton;
