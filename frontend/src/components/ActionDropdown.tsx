import { useState, useRef, useEffect, useCallback, type FC, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export interface ActionDropdownItem {
  label: string;
  icon?: IconDefinition;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  hidden?: boolean;
  disabled?: boolean;
  variant?: "danger";
}

interface ActionDropdownProps {
  items: ActionDropdownItem[];
  children?: ReactNode;
}

const ActionDropdown: FC<ActionDropdownProps> = ({ items }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const visibleItems = items.filter((item) => !item.hidden);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setPosition(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownHeight = dropdownRef.current?.offsetHeight ?? 200;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < dropdownHeight + 8 ? rect.top - dropdownHeight - 4 : rect.bottom + 4;
    setPosition({ top, left: rect.right - 176 });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    // Recalculate after render to apply flip logic with actual height
    requestAnimationFrame(updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, updatePosition]);

  // Focus the first item when menu opens
  useEffect(() => {
    if (isOpen && visibleItems.length > 0) {
      setFocusedIndex(0);
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen, visibleItems.length]);

  // Keep focus in sync with focusedIndex
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % visibleItems.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + visibleItems.length) % visibleItems.length);
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(visibleItems.length - 1);
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          buttonRef.current?.focus();
          break;
        case "Tab":
          setIsOpen(false);
          break;
      }
    },
    [visibleItems.length],
  );

  if (visibleItems.length === 0) return null;

  const baseItemClassName =
    "flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors text-left focus:outline-none";
  const itemClassName = (item: ActionDropdownItem) => {
    if (item.disabled) return `${baseItemClassName} text-gray-500`;
    if (item.variant === "danger")
      return `${baseItemClassName} text-red-400 hover:bg-red-500/20 focus:bg-red-500/20`;
    return `${baseItemClassName} text-gray-200 hover:bg-gray-700 focus:bg-gray-700`;
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-600 text-gray-300 hover:text-white transition-colors cursor-pointer"
        onClick={() => {
          if (!isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPosition({ top: rect.bottom + 4, left: rect.right - 176 });
          }
          setIsOpen(!isOpen);
        }}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Actions"
        title="Actions"
      >
        <FontAwesomeIcon icon={faEllipsisVertical} />
      </button>

      {isOpen &&
        position &&
        createPortal(
          <div
            ref={dropdownRef}
            role="menu"
            aria-label="Actions"
            tabIndex={-1}
            className="fixed w-44 bg-gray-800 border border-neutral-600 rounded shadow-lg z-popover overflow-hidden"
            style={{ top: position.top, left: position.left }}
            onKeyDown={handleMenuKeyDown}
          >
            {visibleItems.map((item, index) => {
              const iconClass =
                item.variant === "danger" ? "w-3.5 text-red-400" : "w-3.5 text-gray-400";
              if (item.href && item.external && !item.disabled) {
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    tabIndex={focusedIndex === index ? 0 : -1}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    className={itemClassName(item)}
                    onClick={() => setIsOpen(false)}
                  >
                    {item.icon && <FontAwesomeIcon icon={item.icon} className={iconClass} />}
                    <span>{item.label}</span>
                  </a>
                );
              }
              return item.href && !item.disabled ? (
                <Link
                  key={item.label}
                  to={item.href}
                  role="menuitem"
                  tabIndex={focusedIndex === index ? 0 : -1}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  className={itemClassName(item)}
                  onClick={() => setIsOpen(false)}
                >
                  {item.icon && <FontAwesomeIcon icon={item.icon} className={iconClass} />}
                  <span>{item.label}</span>
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  tabIndex={focusedIndex === index ? 0 : -1}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  className={itemClassName(item)}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return;
                    item.onClick?.();
                    setIsOpen(false);
                  }}
                >
                  {item.icon && <FontAwesomeIcon icon={item.icon} className={iconClass} />}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
};

export default ActionDropdown;
