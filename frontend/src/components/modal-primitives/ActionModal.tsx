import type { FC } from "react";
import Modal, { type ModalProps } from "./Modal";

type ActionModalProps = Omit<ModalProps, "variant">;

const ActionModal: FC<ActionModalProps> = (props) => <Modal variant="action" {...props} />;

export default ActionModal;
