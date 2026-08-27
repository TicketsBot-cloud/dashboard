import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";

interface FloatingPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

interface UseFloatingDropdownOptions {
  isOpen: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  dropdownRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  maxHeight?: number;
  minWidth?: number;
  viewportPadding?: number;
  matchTriggerWidth?: boolean;
  captureScroll?: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function useFloatingDropdown({
  isOpen,
  triggerRef,
  dropdownRef,
  onClose,
  maxHeight = 280,
  minWidth = 280,
  viewportPadding = 8,
  matchTriggerWidth = false,
  captureScroll = true,
}: UseFloatingDropdownOptions) {
  const [position, setPosition] = useState<FloatingPosition>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight,
  });

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const availableHeight = window.innerHeight - rect.bottom - viewportPadding;
    const isMobile = window.innerWidth < 640;
    const width = matchTriggerWidth
      ? isMobile
        ? window.innerWidth - viewportPadding * 2
        : rect.width
      : Math.min(Math.max(rect.width, minWidth), window.innerWidth - viewportPadding * 2);
    const left = clamp(
      rect.left,
      viewportPadding,
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    );
    const height = Math.max(80, Math.min(maxHeight, availableHeight));

    setPosition({
      top: rect.bottom + 4,
      left,
      width,
      maxHeight: height,
    });
  }, [matchTriggerWidth, maxHeight, minWidth, triggerRef, viewportPadding]);

  useLayoutEffect(() => {
    if (isOpen) updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", updatePosition, captureScroll);
    window.addEventListener("resize", updatePosition);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", updatePosition, captureScroll);
      window.removeEventListener("resize", updatePosition);
    };
  }, [captureScroll, dropdownRef, isOpen, onClose, triggerRef, updatePosition]);

  return { position, updatePosition };
}
