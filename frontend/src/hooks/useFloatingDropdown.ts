import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

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
  const triggerRect = useRef<DOMRect | null>(null);
  const lastHeight = useRef<number | null>(null);
  // Side for the current open/scroll/resize; null until a measurement settles it.
  const side = useRef<boolean | null>(null);
  // Tallest the menu has been since it went above, so filtering never flips it back down.
  const neededHeight = useRef(0);

  // Re-renders reuse the last open/scroll/resize's rect and side, so content can't move the menu.
  const place = useCallback(() => {
    const rect = triggerRect.current;
    if (!rect) return;

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

    // The on-screen keyboard shrinks and pans only the visual viewport.
    const viewport = window.visualViewport;
    const viewTop = viewport?.offsetTop ?? 0;
    const viewBottom = viewTop + (viewport?.height ?? window.innerHeight);
    const spaceBelow = viewBottom - rect.bottom - viewportPadding;
    // Pin above a keyboard covering the trigger; slide out with a trigger scrolled off the page.
    const pageBottom = Math.max(document.documentElement.clientHeight, window.innerHeight);
    const offPage = Math.max(0, rect.top - pageBottom);
    const anchor = Math.min(rect.top - 4, viewBottom - viewportPadding + offPage);
    const spaceAbove = anchor - viewTop - viewportPadding;

    const dropdown = dropdownRef.current;
    const box = dropdown?.getBoundingClientRect();
    const rendered = box?.height ?? 0;
    lastHeight.current = rendered;
    // Rendered height is a lower bound on what the menu needs; at a stale width it means nothing.
    const measured = box && Math.abs(box.width - width) < 0.5 ? rendered : 0;
    const needed = Math.max(neededHeight.current, measured);
    const above =
      side.current ??
      (spaceBelow < maxHeight && needed >= spaceBelow - 0.5 && spaceAbove > spaceBelow);
    // Clipped by a smaller cap than it gets below, so "fits below" isn't final yet.
    const applied = dropdown ? parseFloat(dropdown.style.maxHeight) : NaN;
    const squeezed = rendered >= applied - 0.5 && applied < Math.min(maxHeight, spaceBelow) - 0.5;
    if (measured && (above || !squeezed)) side.current = above;
    neededHeight.current = above ? needed : 0;
    const height = Math.max(0, Math.min(maxHeight, above ? spaceAbove : spaceBelow));
    const top = above ? anchor - Math.min(rendered, height) : rect.bottom + 4;

    setPosition((prev) =>
      prev.top === top && prev.left === left && prev.width === width && prev.maxHeight === height
        ? prev
        : { top, left, width, maxHeight: height },
    );
  }, [dropdownRef, matchTriggerWidth, maxHeight, minWidth, viewportPadding]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const dropdown = dropdownRef.current;
    const box = dropdown?.getBoundingClientRect();
    // WebKit client rects are visual-viewport based, fixed `top` layout-viewport based; 0 elsewhere.
    const shift = dropdown && box ? Math.round(parseFloat(dropdown.style.top) - box.top) || 0 : 0;
    const rect = trigger.getBoundingClientRect();
    triggerRect.current = new DOMRect(rect.x, rect.y + shift, rect.width, rect.height);
    side.current = null;
    place();
  }, [dropdownRef, place, triggerRef]);

  // No deps: re-place after renders that change the menu's height, or until its side is settled.
  useLayoutEffect(() => {
    if (!isOpen) {
      neededHeight.current = 0;
      lastHeight.current = null;
    } else if (lastHeight.current === null) {
      updatePosition();
    } else if (
      side.current === null ||
      (dropdownRef.current?.getBoundingClientRect().height ?? 0) !== lastHeight.current
    ) {
      place();
    }
  });

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

    // Scrolling the menu's own list doesn't move the trigger.
    const handleScroll = (event: Event) => {
      if (!dropdownRef.current?.contains(event.target as Node)) updatePosition();
    };

    const viewport = window.visualViewport;
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, captureScroll);
    window.addEventListener("resize", updatePosition);
    viewport?.addEventListener("resize", updatePosition);
    viewport?.addEventListener("scroll", updatePosition);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, captureScroll);
      window.removeEventListener("resize", updatePosition);
      viewport?.removeEventListener("resize", updatePosition);
      viewport?.removeEventListener("scroll", updatePosition);
    };
  }, [captureScroll, dropdownRef, isOpen, onClose, triggerRef, updatePosition]);

  return { position, updatePosition };
}
