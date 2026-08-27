import { useCallback, type KeyboardEvent } from "react";

interface UseKeyboardNavigationOptions {
  onEnter?: () => void;
  onSpace?: () => void;
  onEscape?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  preventDefault?: boolean;
}

export const useKeyboardNavigation = (options: UseKeyboardNavigationOptions = {}) => {
  const {
    onEnter,
    onSpace,
    onEscape,
    onArrowUp,
    onArrowDown,
    onArrowLeft,
    onArrowRight,
    preventDefault = true,
  } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      switch (event.key) {
        case "Enter":
          if (onEnter) {
            if (preventDefault) event.preventDefault();
            onEnter();
          }
          break;
        case " ":
          if (onSpace) {
            if (preventDefault) event.preventDefault();
            onSpace();
          }
          break;
        case "Escape":
          if (onEscape) {
            if (preventDefault) event.preventDefault();
            onEscape();
          }
          break;
        case "ArrowUp":
          if (onArrowUp) {
            if (preventDefault) event.preventDefault();
            onArrowUp();
          }
          break;
        case "ArrowDown":
          if (onArrowDown) {
            if (preventDefault) event.preventDefault();
            onArrowDown();
          }
          break;
        case "ArrowLeft":
          if (onArrowLeft) {
            if (preventDefault) event.preventDefault();
            onArrowLeft();
          }
          break;
        case "ArrowRight":
          if (onArrowRight) {
            if (preventDefault) event.preventDefault();
            onArrowRight();
          }
          break;
      }
    },
    [onEnter, onSpace, onEscape, onArrowUp, onArrowDown, onArrowLeft, onArrowRight, preventDefault],
  );

  return { handleKeyDown };
};
