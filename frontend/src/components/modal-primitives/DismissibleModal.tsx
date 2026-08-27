import type { FC, ReactNode } from "react";
import Modal, { type ModalProps } from "./Modal";

type DismissibleModalProps = Omit<ModalProps, "variant" | "children"> & {
  children: ReactNode;
  /** Skip default p-6 padding wrapper when content manages its own layout */
  unstyled?: boolean;
};

const DismissibleModal: FC<DismissibleModalProps> = ({ children, unstyled = false, ...props }) => (
  <Modal variant="dismissible" {...props}>
    {unstyled ? children : <div className="p-6 pr-12">{children}</div>}
  </Modal>
);

export default DismissibleModal;
