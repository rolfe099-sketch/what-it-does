// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// The canonical origin. Everything that needs an absolute URL — sitemap,
// canonical tags, RSS, Open Graph images — derives from this one value.
// Change it here and nowhere else.
export default defineConfig({
  site: 'https://layerfix.com',
  integrations: [sitemap()],
  build: {
    // Emit /about/index.html rather than /about.html so URLs have no extension
    // and trailing-slash behaviour is consistent on Cloudflare Pages.
    format: 'directory',
  },
  // No client-side framework. Every page is static HTML; the one interactive
  // component is a progressively-enhanced vanilla script.
});
