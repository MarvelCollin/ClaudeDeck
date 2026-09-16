export const LOGO_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="ClaudeDeck">',
  '<rect width="32" height="32" rx="7" fill="#0f6f86"/>',
  '<rect x="6" y="7" width="13" height="18" rx="3" fill="#ffffff" opacity=".45"/>',
  '<rect x="11" y="10" width="13" height="18" rx="3" fill="#ffffff" opacity=".75"/>',
  '<rect x="16" y="13" width="10" height="12" rx="3" fill="#ffffff"/>',
  '</svg>',
].join('');

export function faviconHref(): string {
  return `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG, 'utf8').toString('base64')}`;
}
