import type { FC, ReactNode } from "react";

interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

const ModalFooter: FC<ModalFooterProps> = ({ children, className = "" }) => (
  <div className={`flex justify-end gap-3 mt-6 ${className}`}>{children}</div>
);

export default ModalFooter;
