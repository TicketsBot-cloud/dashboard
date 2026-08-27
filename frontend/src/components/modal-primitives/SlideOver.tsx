import {
  type FC,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";

export interface SlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Panel width. Default is a typical drawer width; pass a wider class for denser content. */
  className?: string;
  ariaLabelledBy?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Ignore Escape while a dialog is stacked on top of this one (e.g. a confirm
   * modal opened from within the panel). Both dialogs bind Escape to `document`
   * independently, so without this a single press closes both at once.
   */
  disableEscape?: boolean;
}

/**
 * A right-hand drawer: portal mount, Escape-to-close, backdrop click, Tab focus
 * trap, focus return to the trigger on close.
 *
 * This is deliberately a standalone primitive rather than a variant of
 * `Modal.tsx`. Modal's centred/scale-in layout does not fit a drawer, and
 * duplicating the (small) focus-management logic here keeps this component's
 * behaviour easy to reason about without touching, or risking, every existing
 * modal in the app.
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SlideOver: FC<SlideOverProps> = ({
  isOpen,
  onClose,
  children,
  className = "max-w-lg",
  ariaLabelledBy,
  initialFocusRef,
  disableEscape = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  // Holds the last children seen while open, so the close animation has
  // something to render even if the caller's data backing `children` (e.g.
  // the selected row) has already gone away.
  const childrenRef = useRef<ReactNode>(children);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const labelId = useId();

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
    if (isOpen && isVisible && panelRef.current) {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        panelRef.current.focus();
      }
    }
  }, [isOpen, isVisible, initialFocusRef]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!disableEscape) onClose();
        return;
      }

      if (e.key === "Tab" && panelRef.current) {
        const focusableElements =
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
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
    [onClose, disableEscape],
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
      className="fixed inset-0 z-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy || labelId}
    >
      <div
        aria-hidden="true"
        className={`fixed inset-0 bg-black/40 cursor-pointer transition-opacity duration-200 ease-in-out ${
          isAnimating ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`fixed inset-y-0 right-0 flex w-full flex-col bg-gray-800 shadow-xl transform transition-transform duration-200 ease-in-out ${
          isAnimating ? "translate-x-0" : "translate-x-full"
        } ${className}`}
        tabIndex={-1}
      >
        {!ariaLabelledBy && (
          <span id={labelId} className="sr-only">
            Panel
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
          aria-label="Close"
        >
          <FontAwesomeIcon icon={faXmark} className="text-lg" />
        </Button>
        <div className="flex-1 overflow-y-auto p-6 pt-14">
          {isOpen ? children : childrenRef.current}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SlideOver;
