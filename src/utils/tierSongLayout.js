export const measureTierSongLabels = (table, fixedWidth) => {
  const labels = table.querySelectorAll('[data-tier-song-label]');
  if (!fixedWidth) {
    labels.forEach((label) => label.style.removeProperty('font-size'));
    table.style.removeProperty('--tier-chip-height');
    return;
  }
  let maxHeight = 0;
  labels.forEach((label) => {
    const chip = label.parentElement;
    const style = window.getComputedStyle(chip);
    const fontSize = parseFloat(style.fontSize);
    const maxTextHeight = fontSize * 1.35 * 2 + 0.5;
    label.style.removeProperty('font-size');

    if (label.getBoundingClientRect().height > maxTextHeight) {
      let lower = Math.min(10, fontSize);
      let upper = fontSize;
      for (let i = 0; i < 6; i += 1) {
        const candidate = (lower + upper) / 2;
        label.style.fontSize = `${candidate}px`;
        if (label.getBoundingClientRect().height > maxTextHeight) upper = candidate;
        else lower = candidate;
      }
      label.style.fontSize = `${lower}px`;
    }

    const height = label.getBoundingClientRect().height
      + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    maxHeight = Math.max(maxHeight, height);
  });
  if (maxHeight) table.style.setProperty('--tier-chip-height', `${Math.ceil(maxHeight)}px`);
};
