// Root app wrapper - renders outer HTML shell for every Fresh route.
// This is why it exists: ports Next layout (lang, title, fonts, FOUC guard)
// without React providers (added back when context is ported to preact).
import { getCompanyName, withBrand } from "../lib/company.ts";
import { define } from "../utils.ts";

// App shell: builds branded title and outer html/head for all routes.
export default define.page(function App({ Component }) {
  const title = withBrand(
    getCompanyName(),
    "Monitor de Barreiras de Segurança",
  );
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <meta
          name="description"
          content={title}
        />
        <link rel="icon" href="/favicon.svg" />
        {/* External bootstrap: strict CSP needs no inline-script hashes. */}
        <script src="/boot.js"></script>
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
});
