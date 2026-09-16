import { DAYS, renderClientScript } from './client-script';
import { faviconHref } from './logo';
import { renderMarkup } from './markup';
import { PAGE_STYLES } from './styles';

export function renderPage(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ClaudeDeck</title>
<link rel="icon" type="image/svg+xml" href="${faviconHref()}">
<style>${PAGE_STYLES}</style>
</head>
<body>
${renderMarkup()}

<script>
${renderClientScript(token)}
</script>
</body>
</html>`;
}

export { DAYS };
