import type { RecapFilm } from './film';
import { PAINTER_SOURCE } from './painter';
import type { RecapScene } from './scene';

/**
 * Wraps the film and the painter into one self-contained HTML document.
 *
 * Self-contained is the requirement, not a preference. The document is handed
 * to a WebView as a string, there is no server, no bundler and no asset
 * pipeline behind it, so anything it needs has to already be inside it. That
 * also means the same document is what the web build drops into an iframe,
 * and the preview a driver watches is byte-for-byte the thing that gets
 * recorded.
 */

export interface RenderOptions {
  /** Loop the preview. False for recording and for a one-shot playback. */
  loop?: boolean;
  autoplay?: boolean;
  /** Target encoder bitrate. 6 Mbps survives WhatsApp's re-encode legibly. */
  bitrate?: number;
  /**
   * How the finished file comes back. `chunks` base64s it over the bridge for
   * React Native; `objectUrl` keeps it in the page for a browser download.
   */
  deliver?: 'chunks' | 'objectUrl';
}

export function renderRecapDocument(
  scene: RecapScene,
  film: RecapFilm,
  options: RenderOptions = {},
): string {
  const payload = {
    film,
    scene: {
      basemap: scene.basemap,
      brand: scene.brand,
      stats: scene.stats,
    },
    options: {
      loop: options.loop ?? true,
      autoplay: options.autoplay ?? true,
      bitrate: options.bitrate ?? 6_000_000,
      deliver: options.deliver ?? 'chunks',
    },
  };

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<title>Resumo da jornada</title>
<style>
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    background: #05070C;
    overflow: hidden;
    /* The canvas is the interface; a long-press selection ring on it is not. */
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  #stage {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
</head>
<body>
<canvas id="stage"></canvas>
<script>window.__RECAP__ = ${serialise(payload)};</script>
<script>${PAINTER_SOURCE}</script>
</body>
</html>`;
}

/**
 * JSON for an inline `<script>`.
 *
 * A route through a street whose name contains a `<` is not the threat here ,
 * the sequence `</script>` appearing anywhere inside the payload would close
 * the tag early and leave the rest of the film as visible text on a broken
 * page. Escaping the angle brackets is the standard fix; U+2028 and U+2029 go
 * with them because they are legal inside a JSON string and illegal inside a
 * JavaScript one. All four survive as valid JSON.
 */
function serialise(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Messages the document posts back to whatever is hosting it. */
export type RecapMessage =
  | { type: 'ready'; frameCount: number; durationMs: number; fps: number }
  | { type: 'frame'; index: number; total: number }
  | { type: 'ended' }
  | { type: 'progress'; phase: 'tiles' | 'render' | 'encode'; value: number }
  | { type: 'begin'; mime: string; size: number; chunks: number }
  | { type: 'chunk'; index: number; total: number; data: string }
  | { type: 'done'; mime: string; size: number; chunks?: number; url?: string }
  | { type: 'error'; code: string; message: string };

export function parseRecapMessage(raw: string): RecapMessage | null {
  try {
    const parsed = JSON.parse(raw) as RecapMessage;
    return typeof parsed?.type === 'string' ? parsed : null;
  } catch {
    return null;
  }
}
