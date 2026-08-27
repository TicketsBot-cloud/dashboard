import type { FC, ReactNode } from "react";

interface ModalHeaderProps {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}

const ModalHeader: FC<ModalHeaderProps> = ({ id, title, description, className = "" }) => (
  <div className={`mb-4 ${className}`}>
    <h3 id={id} className="text-xl font-semibold text-white">
      {title}
    </h3>
    {description && <p className="text-gray-300 mt-2 text-sm">{description}</p>}
  </div>
);

export default ModalHeader;
