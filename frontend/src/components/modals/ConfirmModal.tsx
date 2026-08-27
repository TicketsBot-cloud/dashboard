import { useId, type FC, type ReactNode } from "react";
import ActionModal from "@/components/modal-primitives/ActionModal";
import ModalHeader from "@/components/modal-primitives/ModalHeader";
import ModalFooter from "@/components/modal-primitives/ModalFooter";
import Button, { type ButtonVariant } from "@/components/Button";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: ButtonVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant = "primary",
  onConfirm,
  onCancel,
}) => {
  const titleId = useId();
  return (
    <ActionModal isOpen={isOpen} onClose={onCancel} ariaLabelledBy={titleId}>
      <div className="p-6">
        <ModalHeader id={titleId} title={title} />
        <div className="text-gray-300 mb-6">{message}</div>
        <ModalFooter className="mt-0">
          <Button variant="secondary" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button onClick={onConfirm} variant={confirmVariant}>
            {confirmText}
          </Button>
        </ModalFooter>
      </div>
    </ActionModal>
  );
};

export default ConfirmModal;
