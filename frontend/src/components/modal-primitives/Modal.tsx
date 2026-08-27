import {
  type FC,
  type ReactNode,
  type RefObject,
  useEffect,
  useState,
  useRef,
  useCallback,
  useId,
} from "react";
import { createPortal } from "react-dom";
import ModalCloseButton from "./ModalCloseButton";

export type ModalVariant = "action" | "dismissible";

export interface ModalProps {
  variant: ModalVariant;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  ariaLabelledBy?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  hideCloseButton?: boolean;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Modal: FC<ModalProps> = ({
  variant,
  isOpen,
  onClose,
  children,
  className = "max-w-md",
  ariaLabelledBy,
  initialFocusRef,
  hideCloseButton = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const childrenRef = useRef<ReactNode>(children);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const labelId = useId();

  const isDismissible = variant === "dismissible";

  useEffect(() => {
    if (isOpen) {
      childrenRef.current = children;
    }
  }, [isOpen, children]);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setIsVisible(true);
      const timeout = setTimeout(() => setIsAnimating(true), 10);
      return () => clearTimeout(timeout);
    } else {
      setIsAnimating(false);
      const timeout = setTimeout(() => {
        setIsVisible(false);
        previousFocusRef.current?.focus();
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && isVisible && modalRef.current) {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        modalRef.current.focus();
      }
    }
  }, [isOpen, isVisible, initialFocusRef]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusableElements =
          modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isVisible) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy || labelId}
    >
      <div
        aria-hidden="true"
        className={`fixed inset-0 bg-black/40 transition-opacity duration-200 ease-in-out ${
          isAnimating ? "opacity-100" : "opacity-0"
        } ${isDismissible ? "cursor-pointer" : "cursor-default"}`}
        onClick={isDismissible ? onClose : undefined}
      />
      <div
        ref={modalRef}
        className={`relative bg-gray-800 rounded-xl w-full mx-4 transform transition-all duration-200 ease-in-out ${
          isAnimating ? "opacity-100 scale-100" : "opacity-0 scale-95"
        } ${className}`}
        tabIndex={-1}
      >
        {!ariaLabelledBy && (
          <span id={labelId} className="sr-only">
            Modal dialogue
          </span>
        )}
        {isDismissible && !hideCloseButton && <ModalCloseButton onClose={onClose} />}
        {isOpen ? children : childrenRef.current}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
