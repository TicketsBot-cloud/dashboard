import { useId, type FC } from "react";
import DismissibleModal from "@/components/modal-primitives/DismissibleModal";
import { PANEL_SWITCH_OPTIONS } from "@/constants/panelSwitchBehaviour";

interface PanelSwitchBehaviourInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PanelSwitchBehaviourInfoModal: FC<PanelSwitchBehaviourInfoModalProps> = ({
  isOpen,
  onClose,
}) => {
  const titleId = useId();

  return (
    <DismissibleModal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-lg max-h-[90vh] overflow-y-auto"
      ariaLabelledBy={titleId}
      unstyled
    >
      <div className="p-6 pr-12">
        <h2 id={titleId} className="text-xl font-semibold text-white mb-3">
          Claim Behaviour on Panel Switch
        </h2>
        <p className="text-gray-300 text-sm mb-6 leading-relaxed">
          When a staff member moves a claimed ticket to another panel, these options control what
          happens to their claim and channel access — especially if they cannot access the new
          panel.
        </p>
        <ul className="space-y-4">
          {PANEL_SWITCH_OPTIONS.map((opt) => (
            <li
              key={opt.key}
              className="rounded-lg border-l-[3px] border-[#5865f2] bg-gray-700/40 p-4"
            >
              <h3 className="text-white font-medium mb-1">{opt.label}</h3>
              <p className="text-gray-300 text-sm leading-relaxed">{opt.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </DismissibleModal>
  );
};

export default PanelSwitchBehaviourInfoModal;
