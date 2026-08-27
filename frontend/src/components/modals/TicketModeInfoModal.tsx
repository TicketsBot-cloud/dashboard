import { useId, type FC } from "react";
import DismissibleModal from "@/components/modal-primitives/DismissibleModal";

interface TicketModeInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TicketModeInfoModal: FC<TicketModeInfoModalProps> = ({ isOpen, onClose }) => {
  const titleId = useId();

  return (
    <DismissibleModal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-3xl max-h-[90vh] overflow-y-auto"
      ariaLabelledBy={titleId}
      unstyled
    >
      <div className="p-6 pr-12">
        <h2 id={titleId} className="text-xl font-semibold text-white mb-3">
          Thread Mode vs Channel Mode
        </h2>
        <p className="text-gray-300 text-sm mb-6 leading-relaxed">
          Choose how new tickets are created when someone opens a ticket from this panel. You can
          switch modes at any time, but existing tickets keep the format they were opened with.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-lg border-l-[3px] border-[#5865f2] bg-gray-700/40 p-4">
            <h3 className="text-white font-medium mb-2">Channel Mode</h3>
            <p className="text-gray-300 text-sm mb-4 leading-relaxed">
              Each ticket opens as a <strong className="text-white">private channel</strong> in your
              ticket category. Best when you want tickets separated like traditional support
              channels and use category-based permissions.
            </p>
            <img
              src="/images/ticket_channel.png"
              alt="Example ticket opened as a private channel in a ticket category"
              className="w-full rounded-lg border border-neutral-600"
            />
          </section>

          <section className="rounded-lg border-l-[3px] border-[#57F287] bg-gray-700/40 p-4">
            <h3 className="text-white font-medium mb-2">Thread Mode</h3>
            <p className="text-gray-300 text-sm mb-4 leading-relaxed">
              Each ticket opens as a <strong className="text-white">thread</strong> under your panel
              channel. Keeps tickets grouped in one place and requires a{" "}
              <strong className="text-white">Thread Notification Channel</strong> so staff get{" "}
              <strong className="text-white">Join Ticket</strong> alerts.
            </p>
            <img
              src="/images/ticket_thread.png"
              alt="Example ticket opened as a thread under a panel channel"
              className="w-full rounded-lg border border-neutral-600"
            />
          </section>
        </div>
      </div>
    </DismissibleModal>
  );
};

export default TicketModeInfoModal;
