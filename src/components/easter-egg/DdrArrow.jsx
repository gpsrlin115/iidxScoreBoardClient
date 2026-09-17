import { useId } from 'react';

/**
 * Rotation and tip-to-tail gradient per direction, after the four-colour DDR
 * arrow set the easter egg was designed from.
 */
const ARROW_STYLES = {
  ArrowLeft: { rotate: 270, stops: ['#ff4fd8', '#8a5cff', '#3f6bff'] },
  ArrowDown: { rotate: 180, stops: ['#ffe45c', '#ff9b3d', '#b03a78'] },
  ArrowUp: { rotate: 0, stops: ['#9ff5dc', '#62e3bb', '#2fbf98'] },
  ArrowRight: { rotate: 90, stops: ['#ff8a7a', '#f0679f', '#7b5cff'] },
};

/**
 * A DDR step arrow: a black-outlined chevron on a stem, filled with a
 * gradient and inlaid with a white chevron and two white stem segments.
 *
 * It is drawn once pointing up and rotated per direction, the way DDR note
 * skins are, so the gradient turns with the arrow and always runs tip to
 * tail. The rotation lives on the <svg>; callers animate a wrapper element,
 * so an animated transform never overwrites it.
 *
 * @param {'ArrowLeft' | 'ArrowDown' | 'ArrowUp' | 'ArrowRight'} direction
 * @param {string} [className]
 */
const DdrArrow = ({ direction, className }) => {
  // Each arrow carries its own <linearGradient>. With one shared id every
  // arrow would paint from whichever copy came first in the document, and
  // that copy is removed the moment its own arrow finishes rising.
  const gradientId = useId();
  const { rotate, stops } = ARROW_STYLES[direction];

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={{ transform: `rotate(${rotate}deg)` }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stops[0]} />
          <stop offset="0.5" stopColor={stops[1]} />
          <stop offset="1" stopColor={stops[2]} />
        </linearGradient>
      </defs>
      {/* paint-order puts the stroke under the fill, so only its outer half
          shows and the outline grows outward instead of eating the body. */}
      <path
        d="M47 8H53L95 50V64L93 66H80L63 49V83L53 93H47L37 83V49L20 66H7L5 64V50Z"
        fill={`url(#${gradientId})`}
        stroke="#0b0d17"
        strokeWidth="9"
        strokeLinejoin="miter"
        paintOrder="stroke"
      />
      <path d="M48 17H52L86 51V57H81L50 26L19 57H14V51Z" fill="#fff" />
      <path d="M50 33L56 39V61L50 55L44 61V39Z" fill="#fff" />
      <path d="M50 61L56 67V83L52 87H48L44 83V67Z" fill="#fff" />
    </svg>
  );
};

export default DdrArrow;
