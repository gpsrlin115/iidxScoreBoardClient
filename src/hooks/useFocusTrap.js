import { useEffect, useRef } from 'react';

const TABBABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// offsetParent is null for anything display:none or inside a hidden subtree.
// It is also null for position:fixed elements, but the dialog body never nests
// one, so this stays the cheapest correct visibility test here.
const isVisible = (element) => element.offsetParent !== null;

const getTabbables = (container) => (
  container
    ? Array.from(container.querySelectorAll(TABBABLE_SELECTOR)).filter(isVisible)
    : []
);

/**
 * Confines keyboard focus to a container for as long as the component holding
 * this hook is mounted. Mounting is what activates the trap, so the owner is
 * expected to render conditionally rather than to keep a hidden instance
 * around.
 *
 * While active it also locks body scroll and, on unmount, returns focus to
 * whatever was focused before — so callers must NOT restore focus themselves.
 *
 * @param {() => void} onEscape - Called when Escape is pressed.
 * @param {import('react').RefObject<HTMLElement>} [initialFocusRef] - Element
 *   to focus on activation. Falls back to the first tabbable node, then to the
 *   container itself.
 * @returns {import('react').RefObject<HTMLElement>} Ref to attach to the
 *   container that should hold focus.
 */
const useFocusTrap = ({ onEscape, initialFocusRef }) => {
  const containerRef = useRef(null);
  // Read through refs so the effect never re-subscribes when the parent
  // re-renders with fresh callbacks; re-running it would re-steal focus and
  // yank the caret out of the comment box mid-typing.
  const onEscapeRef = useRef(onEscape);
  const initialFocusHolderRef = useRef(initialFocusRef);

  // Synced in an effect rather than during render (refs are not render-time
  // state). useRef already seeds them with the first values, so the setup
  // effect below sees the right handlers on mount.
  useEffect(() => {
    onEscapeRef.current = onEscape;
    initialFocusHolderRef.current = initialFocusRef;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const container = containerRef.current;
    const initial = initialFocusHolderRef.current?.current;
    (initial ?? getTabbables(container)[0] ?? container)?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscapeRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;

      // Queried on every keypress rather than captured once: the comment list
      // grows and shrinks while the dialog is open, so a stale node list would
      // let focus leak into the page behind it.
      const tabbables = getTabbables(containerRef.current);
      if (tabbables.length === 0) return;

      const first = tabbables[0];
      const last = tabbables[tabbables.length - 1];
      const active = document.activeElement;
      const hasFocusInside = containerRef.current?.contains(active);

      // Only the wrap-around edges are intercepted so every other Tab keeps
      // the browser's native order. The previous implementation called
      // preventDefault() on every Tab and bounced focus back to the close
      // button, which made the dialog unusable as soon as it held more than
      // one control.
      if (event.shiftKey && (active === first || !hasFocusInside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !hasFocusInside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  return containerRef;
};

export default useFocusTrap;
