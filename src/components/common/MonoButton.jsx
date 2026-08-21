import { forwardRef } from 'react';
import clsx from 'clsx';

/**
 * MonoButton - outlined Space Mono button.
 *
 * Used for the login submit button and the score-import upload/result
 * actions.
 *
 * @param {'accent' | 'ghost'} [variant]
 * @param {boolean} [disabled]
 * @param {React.ReactNode} [trailing] - optional trailing element (e.g. an arrow)
 * @param {boolean} [fullWidth]
 * @param {'button' | 'submit'} [type]
 * @param {React.ReactNode} children
 */
const MonoButton = forwardRef(
  (
    {
      variant = 'accent',
      disabled = false,
      trailing,
      fullWidth = false,
      type = 'button',
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const variantClasses = disabled
      ? 'border-[rgba(236,234,244,.1)] text-faint2 cursor-not-allowed'
      : variant === 'ghost'
        ? 'border-[rgba(236,234,244,.1)] text-muted hover:text-ink'
        : 'border-accent text-ink hover:bg-accent hover:text-night';

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={clsx(
          'font-mono text-[11px] uppercase tracking-[.2em] px-[18px] py-[15px] border transition-colors duration-[250ms] inline-flex items-center',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          trailing ? 'justify-between' : 'justify-center',
          fullWidth && 'w-full',
          variantClasses,
          className
        )}
        {...props}
      >
        {children}
        {trailing}
      </button>
    );
  }
);

MonoButton.displayName = 'MonoButton';

export default MonoButton;
