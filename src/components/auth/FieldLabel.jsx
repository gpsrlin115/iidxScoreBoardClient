/**
 * Form field label for the auth screens.
 *
 * The Korean label runs on font-sans, not font-mono: Space Mono ships no
 * Hangul glyphs, so a mono label silently fell back to the browser default
 * and rendered smaller and blurrier than its 9.5px spec implied. Wide
 * tracking and uppercase are Latin-only devices — both hurt Hangul
 * legibility and neither does anything useful here.
 *
 * The mono caption keeps the screen's wide-tracked visual language. It is
 * decorative, so it stays out of the accessible name via aria-hidden.
 */
const FieldLabel = ({ htmlFor, caption, children }) => (
  <label className="block mb-[9px]" htmlFor={htmlFor}>
    <span className="font-sans text-[13px] font-medium tracking-[.04em] text-text2">{children}</span>
    {caption && (
      <span
        aria-hidden="true"
        className="ml-[8px] font-mono text-[9.5px] tracking-[.22em] uppercase text-faint2"
      >
        {caption}
      </span>
    )}
  </label>
);

export default FieldLabel;
