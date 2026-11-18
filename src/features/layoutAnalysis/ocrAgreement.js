export const normalizedTitle = (text) => text.normalize('NFKC').toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]/gu, '');

const editDistance = (left, right) => {
  let row = Array.from({ length: right.length + 1 }, (unused, index) => index);
  for (let i = 0; i < left.length; i += 1) {
    const next = [i + 1];
    for (let j = 0; j < right.length; j += 1) {
      next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(left[i] !== right[j])));
    }
    row = next;
  }
  return row[right.length];
};

export const agrees = (left, right) => {
  const first = normalizedTitle(left.text);
  const second = normalizedTitle(right.text);
  if (!first || !second) return false;
  if (first === second) return true;
  return Math.min(first.length, second.length) >= 8
    && editDistance(first, second) <= Math.floor(Math.max(first.length, second.length) * 0.15);
};

