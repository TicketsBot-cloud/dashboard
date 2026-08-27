import { useId, type FC, type ReactNode } from "react";
import DismissibleModal from "@/components/modal-primitives/DismissibleModal";

export interface ChannelInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  imageSrc: string;
  imageAlt: string;
}

const ChannelInfoModal: FC<ChannelInfoModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  imageSrc,
  imageAlt,
}) => {
  const titleId = useId();

  return (
    <DismissibleModal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-lg"
      ariaLabelledBy={titleId}
    >
      <h2 id={titleId} className="text-xl font-semibold text-white mb-3">
        {title}
      </h2>
      <div className="text-gray-300 text-sm mb-4 space-y-2">{description}</div>
      <img src={imageSrc} alt={imageAlt} className="w-full rounded-lg border border-neutral-600" />
    </DismissibleModal>
  );
};

export default ChannelInfoModal;
