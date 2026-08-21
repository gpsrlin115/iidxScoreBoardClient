import { forwardRef } from 'react';
import clsx from 'clsx';

/**
 * Tag - shared chip primitive.
 *
 * Handles level toggles, SP/DP switches, chart/clear/sort filters, and
 * view toggles with a single component so selection styling stays
 * consistent everywhere a small pressable chip is needed.
 *
 * @param {boolean} [active] - whether this tag is currently selected
 * @param {(event: React.MouseEvent) => void} [onClick]
 * @param {React.ReactNode} children - tag label content
 * @param {string} [title] - optional tooltip text
 */
const Tag = forwardRef(
  ({ active = false, onClick, children, title, className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        title={title}
        aria-pressed={active}
        className={clsx(
          'font-mono text-[10px] uppercase tracking-[.1em] px-2 py-[3px] transition-colors duration-200 cursor-pointer',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          active
            ? 'text-night bg-accent border border-accent'
            : 'text-muted bg-[rgba(236,234,244,.05)] border border-[rgba(236,234,244,.09)] hover:text-ink',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Tag.displayName = 'Tag';

export default Tag;
