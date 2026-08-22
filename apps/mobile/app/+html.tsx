import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import { darkTokens, lightTokens } from '@dinamique/ui';

/**
 * The document that wraps the web build.
 *
 * Everything here runs before React does, which is the only place the opening
 * flash could be fixed. The browser paints the page background as soon as it
 * has the HTML; the bundle arrives much later. With no rule of our own that
 * first paint was white, so a person on the dark theme saw the login screen
 * flash light, go dark when the app mounted, and flash again on the way in.
 *
 * Two rules and eight lines of script remove all three:
 *   - `prefers-color-scheme` gives the right answer for anyone following the
 *     operating system, with no JavaScript at all;
 *   - the stored choice (written by the app under the same key) overrides it
 *     for anyone who picked light or dark explicitly.
 *
 * Colours come from the design tokens, never from a hex typed here, so the
 * document and the application can never drift apart.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* Tells the browser to paint its own chrome (form controls, scroll
            bars, the overscroll gutter) in the matching scheme too. */}
        <meta name="color-scheme" content="light dark" />

        {/* Expo's own reset: the root element scrolls, not the body. */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: BACKGROUND_CSS }} />
        <noscript dangerouslySetInnerHTML={{ __html: NO_SCRIPT_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/**
 * `data-theme` is set by the script below when there is an explicit choice.
 * When it is absent the media query decides, which is the right behaviour for
 * "igual ao celular" and the only behaviour available with scripting off.
 *
 * `#root` starts invisible, and the application reveals it once it has
 * mounted. That is not a loading trick: the export pre-renders every screen in
 * Node, where there is neither an operating system preference nor a stored
 * one, so the markup that ships in the file is always the light theme. Showing
 * it means a person on the dark theme reads half a second of a white login
 * screen before React replaces it. The background underneath is already the
 * right colour, so what they see instead is the app arriving in one piece.
 */
const BACKGROUND_CSS = `
html, body, #root {
  background-color: ${lightTokens.backgroundPrimary};
}
@media (prefers-color-scheme: dark) {
  html:not([data-theme='light']), html:not([data-theme='light']) body, html:not([data-theme='light']) #root {
    background-color: ${darkTokens.backgroundPrimary};
  }
}
html[data-theme='dark'], html[data-theme='dark'] body, html[data-theme='dark'] #root {
  background-color: ${darkTokens.backgroundPrimary};
}
html[data-theme='light'], html[data-theme='light'] body, html[data-theme='light'] #root {
  background-color: ${lightTokens.backgroundPrimary};
}
#root {
  opacity: 0;
}
html[data-ready] #root {
  opacity: 1;
  transition: opacity 180ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  html[data-ready] #root { transition: none; }
}
`;

/** With scripting off nothing can reveal the page, so nothing hides it. */
const NO_SCRIPT_CSS = `<style>#root { opacity: 1; }</style>`;

/**
 * Reads the same key `src/features/theme/preference.ts` writes. Kept as a
 * string rather than a module because it has to run inline, before anything
 * is fetched.
 */
const THEME_BOOTSTRAP = `
(function () {
  try {
    var stored = window.localStorage.getItem('dinamique.theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (error) {
    // Storage blocked. The media query above still gives a sensible answer.
  }
  // Failsafe. If the bundle never runs, a hidden page is worse than a page in
  // the wrong theme, so it is shown anyway.
  setTimeout(function () {
    document.documentElement.setAttribute('data-ready', '');
  }, 4000);
})();
`;
