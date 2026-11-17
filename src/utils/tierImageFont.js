// SVG images cannot use the page's web fonts unless their data is embedded.
export const getTierImageFontCss = async (node) => {
  const characters = [...new Set([...(node.textContent || ''), ' ', 'L'])];
  const groups = [];
  for (let i = 0; i < characters.length; i += 300) groups.push(characters.slice(i, i + 300).join(''));

  return (await Promise.all(groups.map(async (text) => {
    const url = new URL('https://fonts.googleapis.com/css2');
    [
      'Gothic A1:wght@300;400;500;700',
      'IBM Plex Sans JP:wght@400',
      'Space Grotesk:wght@400;500;600;700',
      'Space Mono:wght@400;700',
    ].forEach((family) => url.searchParams.append('family', family));
    url.searchParams.set('text', text);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load tier image font stylesheet');
    const css = await response.text();
    const fontUrls = [...new Set([...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map((match) => match[1]))];
    if (!fontUrls.length) throw new Error('Tier image font stylesheet has no font URL');

    const embedded = await Promise.all(fontUrls.map(async (fontUrl) => {
      const fontResponse = await fetch(fontUrl);
      if (!fontResponse.ok) throw new Error('Failed to load tier image font');
      const fontBlob = await fontResponse.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(fontBlob);
      });
      return [fontUrl, dataUrl];
    }));
    return embedded.reduce((result, [fontUrl, dataUrl]) => result.replaceAll(fontUrl, dataUrl), css);
  }))).join('\n');
};
