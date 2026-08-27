import { useId, type FC } from "react";
import DismissibleModal from "@/components/modal-primitives/DismissibleModal";

interface MultiPanelInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MultiPanelInfoModal: FC<MultiPanelInfoModalProps> = ({ isOpen, onClose }) => {
  const titleId = useId();

  return (
    <DismissibleModal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-4xl max-h-[90vh] overflow-y-auto"
      ariaLabelledBy={titleId}
      unstyled
    >
      <div className="p-6 pr-12">
        <h2 id={titleId} className="text-xl font-semibold text-white mb-3">
          Multi-Panel Display Modes
        </h2>
        <p className="text-gray-300 text-sm mb-6 leading-relaxed">
          A multi-panel posts one embed in your panel channel. Members pick which panel to open
          using either <strong className="text-white">buttons</strong> or a{" "}
          <strong className="text-white">dropdown</strong> — configure this with{" "}
          <strong className="text-white">Use Dropdown Menu</strong> below.
        </p>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border-l-[3px] border-[#5865f2] bg-gray-700/40 p-4">
            <h3 className="text-white font-medium mb-2">Button Mode</h3>
            <p className="text-gray-300 text-sm mb-4 leading-relaxed">
              Each linked panel appears as its own coloured button under the embed. Best for a small
              number of options (about 2–5 panels).
            </p>
            <img
              src="/images/multipanel_buttons.png"
              alt="Multi-panel with Support and Billing buttons in Discord"
              className="w-full rounded-lg border border-neutral-600"
            />
          </section>

          <section className="rounded-lg border-l-[3px] border-[#57F287] bg-gray-700/40 p-4">
            <h3 className="text-white font-medium mb-2">Dropdown Mode</h3>
            <p className="text-gray-300 text-sm mb-4 leading-relaxed">
              All panels appear in one menu. Add optional descriptions per panel in{" "}
              <strong className="text-white">Panel Customization</strong> so members see more
              context before opening a ticket.
            </p>
            <img
              src="/images/multipanel_dropdown.png"
              alt="Multi-panel with an open dropdown showing Support and Billing in Discord"
              className="w-full rounded-lg border border-neutral-600"
            />
          </section>
        </div>
      </div>
    </DismissibleModal>
  );
};

export default MultiPanelInfoModal;
