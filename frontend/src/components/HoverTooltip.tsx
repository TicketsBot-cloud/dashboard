import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

type Placement = "top" | "right" | "bottom";

type HoverTooltipProps = ComponentPropsWithoutRef<"div"> & {
  label: ReactNode;
  /** When false, the tooltip never shows and any visible tooltip is dismissed immediately. */
  enabled?: boolean;
  /** Side of the anchor the tooltip sits on. */
  placement?: Placement;
  boundaryRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

const VIEWPORT_PADDING = 8;

/**
 * Hover-only label tooltip.
 * Renders via portal so it is not clipped by overflow ancestors (e.g. sidebar nav,
 * the horizontally scrollable analytics heatmap).
 */
export function HoverTooltip({
  label,
  enabled = true,
  placement = "right",
  boundaryRef,
  children,
  className,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: HoverTooltipProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [resolvedPlacement, setResolvedPlacement] = useState<Placement>(placement);

  const hide = useCallback(() => setVisible(false), []);

  // Position the panel for a given placement relative to the anchor rect.
  const placeFor = useCallback((p: Placement, rect: DOMRect) => {
    switch (p) {
      case "top":
        return { top: rect.top - VIEWPORT_PADDING, left: rect.left + rect.width / 2 };
      case "bottom":
        return { top: rect.bottom + VIEWPORT_PADDING, left: rect.left + rect.width / 2 };
      default:
        return { top: rect.top + rect.height / 2, left: rect.right + VIEWPORT_PADDING };
    }
  }, []);

  const show = useCallback(() => {
    if (!enabled || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setResolvedPlacement(placement);
    setPosition(placeFor(placement, rect));
    setVisible(true);
  }, [enabled, placement, placeFor]);

  useEffect(() => {
    if (!enabled) setVisible(false);
  }, [enabled]);

  // The panel is fixed-position with coordinates captured once on hover, so a scroll
  // or resize would strand it away from its anchor. Dismiss instead of tracking.
  useEffect(() => {
    if (!visible) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [visible, hide]);

  useLayoutEffect(() => {
    const node = tooltipRef.current;
    if (!visible || !node) return;

    // Bounds default to the viewport; intersect with the boundary element if given.
    let minX = VIEWPORT_PADDING;
    let minY = VIEWPORT_PADDING;
    let maxX = window.innerWidth - VIEWPORT_PADDING;
    let maxY = window.innerHeight - VIEWPORT_PADDING;
    const boundary = boundaryRef?.current?.getBoundingClientRect();
    if (boundary) {
      minX = Math.max(minX, boundary.left + VIEWPORT_PADDING);
      minY = Math.max(minY, boundary.top + VIEWPORT_PADDING);
      maxX = Math.min(maxX, boundary.right - VIEWPORT_PADDING);
      maxY = Math.min(maxY, boundary.bottom - VIEWPORT_PADDING);
    }

    const rect = node.getBoundingClientRect();

    if (boundary && anchorRef.current) {
      const anchor = anchorRef.current.getBoundingClientRect();
      const roomAbove = anchor.top - minY;
      const roomBelow = maxY - anchor.bottom;
      if (resolvedPlacement === "top" && rect.top < minY && roomBelow > roomAbove) {
        setResolvedPlacement("bottom");
        setPosition(placeFor("bottom", anchor));
        return;
      }
      if (resolvedPlacement === "bottom" && rect.bottom > maxY && roomAbove > roomBelow) {
        setResolvedPlacement("top");
        setPosition(placeFor("top", anchor));
        return;
      }
    }

    let dx = 0;
    if (rect.right > maxX) dx = maxX - rect.right;
    if (rect.left + dx < minX) dx = minX - rect.left;

    let dy = 0;
    if (rect.bottom > maxY) dy = maxY - rect.bottom;
    if (rect.top + dy < minY) dy = minY - rect.top;

    if (dx !== 0 || dy !== 0) {
      setPosition((prev) => ({ top: prev.top + dy, left: prev.left + dx }));
    }
  }, [visible, resolvedPlacement, boundaryRef, placeFor]);

  return (
    <>
      <div
        ref={anchorRef}
        className={className}
        onMouseEnter={(e) => {
          show();
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          hide();
          onMouseLeave?.(e);
        }}
        {...rest}
      >
        {children}
      </div>
      {enabled &&
        visible &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className={`fixed px-2 py-1 bg-gray-900 text-white text-sm rounded shadow-lg pointer-events-none z-9999 whitespace-nowrap ${
              resolvedPlacement === "top"
                ? "-translate-x-1/2 -translate-y-full"
                : resolvedPlacement === "bottom"
                  ? "-translate-x-1/2"
                  : "-translate-y-1/2"
            }`}
            style={{ top: position.top, left: position.left }}
          >
            {label}
            {resolvedPlacement === "right" && (
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
