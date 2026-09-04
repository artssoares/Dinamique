/**
 * The painter.
 *
 * Plain ES5-ish browser JavaScript, shipped as a string and evaluated inside
 * whatever view is showing the recap: a WebView on the phone, an iframe on the
 * web. It is deliberately dumb, it receives a film (see film.ts) and paints
 * the numbers it is given. Every decision about *where the camera goes* was
 * made in TypeScript, under test, before this file ever ran.
 *
 * Two constraints shape the code, and both are worth knowing before editing:
 *
 *  - No backticks and no `${` anywhere in the source below, because the whole
 *    thing lives inside a template literal. String concatenation is not a
 *    style choice here.
 *  - No `Math.random()`, no `Date.now()` in anything that draws. A frame must
 *    depend only on its index, or the exported video and the preview stop
 *    being the same film.
 */
export const PAINTER_SOURCE = `
(function () {
  'use strict';

  var RECAP = window.__RECAP__;
  if (!RECAP) return;

  var film = RECAP.film;
  var scene = RECAP.scene;
  var options = RECAP.options || {};

  var basemap = scene.basemap || {};
  var brand = scene.brand || {};
  var stats = scene.stats || {};
  var channels = film.channels;

  var canvas = document.getElementById('stage');
  var ctx = canvas.getContext('2d', { alpha: false });
  canvas.width = film.width;
  canvas.height = film.height;

  var W = film.width;
  var H = film.height;
  /** Every size below is expressed against a 1080-wide design. */
  var U = W / 1080;
  var TILE = basemap.tileSize || 256;
  /**
   * The head sits below centre so the road ahead has more room than the road
   * behind. 0.58 is the number that stopped feeling like the camera was
   * trailing the driver.
   */
  var ANCHOR_Y = 0.58;

  var FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  var COLOR_PRIMARY = brand.primary || '#0137F7';
  var COLOR_ACCENT = brand.accent || '#FF6A54';
  var COLOR_INK = brand.ink || '#0D1016';

  function toRgb(hex) {
    var value = String(hex).replace('#', '');
    if (value.length === 3) {
      value = value.charAt(0) + value.charAt(0) + value.charAt(1) + value.charAt(1) +
        value.charAt(2) + value.charAt(2);
    }
    var int = parseInt(value, 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  }

  var PRIMARY_RGB = toRgb(COLOR_PRIMARY);
  var ACCENT_RGB = toRgb(COLOR_ACCENT);
  /**
   * The midpoint of the route ramp. Blending brand blue straight into coral
   * passes through a muddy brown; a violet waypoint keeps every step of the
   * line saturated, which is what makes the trail read as one glowing object.
   */
  var MID_RGB = toRgb('#7A5BFF');

  // ---------------------------------------------------------------- utils --

  function post(message) {
    try {
      var payload = JSON.stringify(message);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(payload);
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      }
    } catch (error) {
      /* A telemetry failure must never stop the film. */
    }
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  /**
   * Currency, grouped by hand rather than through toLocaleString.
   * Intl output differs between engines (and between Android WebView
   * versions), and a video that renders 'R$ 1.234,50' on one phone and
   * 'R$ 1234,50' on another is not one design.
   */
  function formatCents(value) {
    var negative = value < 0;
    var abs = Math.abs(Math.round(value));
    var reais = Math.floor(abs / 100);
    var cents = abs % 100;
    var digits = String(reais);
    var grouped = '';
    for (var i = 0; i < digits.length; i += 1) {
      if (i > 0 && (digits.length - i) % 3 === 0) grouped += '.';
      grouped += digits.charAt(i);
    }
    var centsText = cents < 10 ? '0' + cents : String(cents);
    return (negative ? '-' : '') + 'R$ ' + grouped + ',' + centsText;
  }

  function formatKm(metres) {
    var km = metres / 1000;
    var text = km >= 100 ? String(Math.round(km)) : km.toFixed(1).replace('.', ',');
    return text + ' km';
  }

  function formatDuration(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    if (hours === 0) return minutes + 'min';
    if (minutes === 0) return hours + 'h';
    return hours + 'h ' + minutes + 'min';
  }

  function roundRect(context, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    if (context.roundRect) {
      context.roundRect(x, y, width, height, r);
      return;
    }
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function withAlpha(hex, alpha) {
    var value = hex.replace('#', '');
    if (value.length === 3) {
      value = value.charAt(0) + value.charAt(0) + value.charAt(1) + value.charAt(1) +
        value.charAt(2) + value.charAt(2);
    }
    var int = parseInt(value, 16);
    return 'rgba(' + ((int >> 16) & 255) + ',' + ((int >> 8) & 255) + ',' + (int & 255) + ',' + alpha + ')';
  }

  // ---------------------------------------------------------------- tiles --

  var tiles = {};
  var tilesInFlight = 0;

  function tileKey(z, x, y) {
    return z + '/' + x + '/' + y;
  }

  function tileUrl(z, x, y) {
    return String(basemap.urlTemplate)
      .replace('{z}', z)
      .replace('{x}', x)
      .replace('{y}', y)
      .replace('{s}', 'abc'.charAt((x + y) % 3));
  }

  /**
   * Requests a tile and returns it only once it has painted at least once.
   *
   * crossOrigin is mandatory, not defensive: a canvas that has drawn one
   * image without CORS headers is tainted forever, and a tainted canvas
   * cannot be captured. The export would fail at the very last step, after
   * the driver waited through the whole render.
   */
  function getTile(z, x, y, allowLoad) {
    var key = tileKey(z, x, y);
    var entry = tiles[key];
    if (entry) return entry.ok ? entry.image : null;
    if (!allowLoad || !basemap.urlTemplate) return null;

    var image = new Image();
    entry = { image: image, ok: false, failed: false };
    tiles[key] = entry;
    tilesInFlight += 1;
    image.crossOrigin = 'anonymous';
    image.onload = function () {
      entry.ok = true;
      tilesInFlight -= 1;
    };
    image.onerror = function () {
      entry.failed = true;
      tilesInFlight -= 1;
    };
    image.src = tileUrl(z, x, y);
    return null;
  }

  // --------------------------------------------------------------- camera --

  function frameAt(index) {
    var i = clamp(Math.round(index), 0, film.frameCount - 1);
    return {
      index: i,
      cameraX: channels.cameraX[i],
      cameraY: channels.cameraY[i],
      zoom: channels.zoom[i],
      bearing: channels.bearing[i],
      tilt: channels.tilt[i],
      headX: channels.headX[i],
      headY: channels.headY[i],
      progress: channels.progress[i],
      metres: channels.metres[i],
      elapsed: channels.elapsed[i],
      hud: channels.hud[i],
      title: channels.title[i],
      stats: channels.stats[i],
      statsReveal: channels.statsReveal[i],
      signature: channels.signature[i],
      vignette: channels.vignette[i],
      flash: channels.flash[i],
      headGlow: channels.headGlow[i]
    };
  }

  /**
   * World coordinates to screen pixels.
   *
   * Offset from the camera, rotate so the heading points up the screen,
   * squash vertically to fake the lean, then place at the anchor. The squash
   * is affine, a real perspective divide is not something a 2D canvas can do
   * per-pixel at thirty frames a second on a phone, and with the horizon
   * gradient over it nobody has ever noticed the difference.
   */
  function makeProjector(frame) {
    var scale = TILE * Math.pow(2, frame.zoom);
    var radians = (frame.bearing * Math.PI) / 180;
    var cos = Math.cos(radians);
    var sin = Math.sin(radians);
    var originX = W / 2;
    var originY = H * ANCHOR_Y;
    var tilt = frame.tilt;

    return {
      scale: scale,
      project: function (worldX, worldY, out) {
        var dx = (worldX - frame.cameraX) * scale;
        var dy = (worldY - frame.cameraY) * scale;
        out[0] = originX + dx * cos + dy * sin;
        out[1] = originY + (-dx * sin + dy * cos) * tilt;
        return out;
      },
      unproject: function (screenX, screenY, out) {
        var rx = screenX - originX;
        var ry = (screenY - originY) / tilt;
        out[0] = frame.cameraX + (rx * cos - ry * sin) / scale;
        out[1] = frame.cameraY + (rx * sin + ry * cos) / scale;
        return out;
      }
    };
  }

  /** The world-space box the viewport currently covers, with a little margin. */
  function visibleBounds(projector) {
    var corners = [[0, 0], [W, 0], [0, H], [W, H]];
    var scratch = [0, 0];
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (var i = 0; i < corners.length; i += 1) {
      projector.unproject(corners[i][0], corners[i][1], scratch);
      if (scratch[0] < minX) minX = scratch[0];
      if (scratch[0] > maxX) maxX = scratch[0];
      if (scratch[1] < minY) minY = scratch[1];
      if (scratch[1] > maxY) maxY = scratch[1];
    }
    var padX = (maxX - minX) * 0.06;
    var padY = (maxY - minY) * 0.06;
    return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
  }

  /** Tile coordinates the given frame needs. Also used to preload before an export. */
  function tilesForFrame(frame) {
    if (!basemap.urlTemplate) return [];
    var projector = makeProjector(frame);
    var bounds = visibleBounds(projector);
    var z = clamp(Math.round(frame.zoom), 0, basemap.maxZoom || 18);
    var count = Math.pow(2, z);

    var x0 = Math.floor(bounds.minX * count);
    var x1 = Math.floor(bounds.maxX * count);
    var y0 = Math.floor(bounds.minY * count);
    var y1 = Math.floor(bounds.maxY * count);

    // A frame that somehow asks for a thousand tiles is a bug in the camera,
    // not a request worth honouring; cap it and let the backdrop show.
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 160) return [];

    var out = [];
    for (var x = x0; x <= x1; x += 1) {
      for (var y = y0; y <= y1; y += 1) {
        if (y < 0 || y >= count) continue;
        out.push([z, ((x % count) + count) % count, y]);
      }
    }
    return out;
  }

  // -------------------------------------------------------------- painting --

  function paintBackdrop(frame) {
    // Deep navy rather than black: the route's blue end would disappear into
    // true black, and dark mode in this product is never absolute black.
    var gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#080B12');
    gradient.addColorStop(0.55, '#0D1016');
    gradient.addColorStop(1, '#141821');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    if (!basemap.urlTemplate) paintField(frame);
  }

  /**
   * The tileless variant: a slowly drifting grid seen in the same perspective
   * as the map would be. It exists so an account with no tile provider still
   * gets a designed background instead of a black rectangle, and so the
   * mapless recap (no route at all) has something alive behind the numbers.
   */
  function paintField(frame) {
    var projector = makeProjector(frame);
    var bounds = visibleBounds(projector);
    // Sized from the span actually in frame, snapped to a power of two so the
    // lines do not crawl as the camera zooms. Deriving it from the zoom level
    // alone put roughly one line every 150 km, which on a phone screen is no
    // lines at all.
    var span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    var step = Math.pow(2, Math.round(Math.log2(span / 11)));
    var scratch = [0, 0];

    ctx.save();
    ctx.lineWidth = 1.4 * U;
    ctx.strokeStyle = 'rgba(122,142,190,0.16)';
    ctx.beginPath();

    var startX = Math.floor(bounds.minX / step) * step;
    var lines = 0;
    for (var x = startX; x <= bounds.maxX && lines < 90; x += step, lines += 1) {
      projector.project(x, bounds.minY, scratch);
      ctx.moveTo(scratch[0], scratch[1]);
      projector.project(x, bounds.maxY, scratch);
      ctx.lineTo(scratch[0], scratch[1]);
    }
    var startY = Math.floor(bounds.minY / step) * step;
    lines = 0;
    for (var y = startY; y <= bounds.maxY && lines < 90; y += step, lines += 1) {
      projector.project(bounds.minX, y, scratch);
      ctx.moveTo(scratch[0], scratch[1]);
      projector.project(bounds.maxX, y, scratch);
      ctx.lineTo(scratch[0], scratch[1]);
    }
    ctx.stroke();
    ctx.restore();

    // A wash of brand colour toward the horizon, so the grid recedes.
    var wash = ctx.createRadialGradient(W / 2, H * ANCHOR_Y, 0, W / 2, H * ANCHOR_Y, H * 0.75);
    wash.addColorStop(0, withAlpha(COLOR_PRIMARY, 0.22));
    wash.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);
  }

  function paintTiles(frame, allowLoad) {
    if (!basemap.urlTemplate) return;
    var projector = makeProjector(frame);
    var needed = tilesForFrame(frame);
    if (needed.length === 0) return;

    var z = needed[0][0];
    var count = Math.pow(2, z);
    var size = projector.scale / count;
    var radians = (frame.bearing * Math.PI) / 180;

    ctx.save();
    ctx.translate(W / 2, H * ANCHOR_Y);
    ctx.scale(1, frame.tilt);
    ctx.rotate(-radians);
    ctx.translate(-frame.cameraX * projector.scale, -frame.cameraY * projector.scale);

    for (var i = 0; i < needed.length; i += 1) {
      var tile = needed[i];
      var image = getTile(tile[0], tile[1], tile[2], allowLoad);
      if (!image) continue;
      // Half a pixel of overdraw: without it, rotation leaves hairline seams
      // between tiles that read as a grid drawn over the city.
      ctx.drawImage(image, tile[1] * size - 0.5, tile[2] * size - 0.5, size + 1, size + 1);
    }
    ctx.restore();

    // Satellite imagery is bright and busy, and a line drawn straight onto it
    // competes with every rooftop. One flat cool scrim pushes the ground back
    // far enough for the route to lead, and no further, this started as a
    // multiply plus an overlay, which looked considered and rendered the city
    // as a black rectangle with street names on it.
    ctx.save();
    ctx.fillStyle = 'rgba(10,16,32,0.32)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /** Projects the drawn portion of the route into a reusable screen buffer. */
  var routeBuffer = [];

  function buildRoutePoints(frame, projector) {
    routeBuffer.length = 0;
    var path = film.path;
    var distances = film.pathDistances;
    var vertexCount = distances.length;
    if (vertexCount < 2) return 0;

    var total = distances[vertexCount - 1];
    var target = frame.progress >= 1 ? total : frame.metres;
    var scratch = [0, 0];
    var used = 0;

    for (var i = 0; i < vertexCount; i += 1) {
      if (distances[i] > target) break;
      projector.project(path[i * 2], path[i * 2 + 1], scratch);
      routeBuffer.push(scratch[0], scratch[1]);
      used += 1;
    }

    // The head itself is between vertices; without this the line grows in
    // visible steps at every GPS fix instead of flowing.
    projector.project(frame.headX, frame.headY, scratch);
    if (used === 0) {
      routeBuffer.push(scratch[0], scratch[1]);
      used += 1;
    }
    routeBuffer.push(scratch[0], scratch[1]);
    return used + 1;
  }

  function traceRoute(count) {
    ctx.beginPath();
    ctx.moveTo(routeBuffer[0], routeBuffer[1]);
    for (var i = 1; i < count; i += 1) {
      ctx.lineTo(routeBuffer[i * 2], routeBuffer[i * 2 + 1]);
    }
  }

  /**
   * Colour at a fraction along the route: brand blue at the start of the day,
   * coral at the head.
   */
  function routeColorAt(t, alpha) {
    var from = t < 0.55 ? PRIMARY_RGB : MID_RGB;
    var to = t < 0.55 ? MID_RGB : ACCENT_RGB;
    var local = t < 0.55 ? t / 0.55 : (t - 0.55) / 0.45;
    var r = Math.round(from[0] + (to[0] - from[0]) * local);
    var g = Math.round(from[1] + (to[1] - from[1]) * local);
    var b = Math.round(from[2] + (to[2] - from[2]) * local);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /**
   * Strokes the route in chunks, each its own colour.
   *
   * The obvious implementation is one createLinearGradient from the first
   * point to the head, and it is wrong, because a canvas gradient is a
   * gradient across *space*, not along a path. On a route that doubles back
   * (which is most of a working day) the two endpoints land near each other,
   * the gradient collapses, and the whole line turns one colour. Chunking
   * follows the path itself. Thirty chunks is indistinguishable from a
   * continuous ramp at this line width and costs nothing.
   *
   * Chunks overlap by one point so the round joins hide the seams.
   */
  function strokeAlongRoute(count, lineWidth, alpha, blur, blurColor) {
    var chunks = Math.min(30, Math.max(1, count - 1));
    var perChunk = (count - 1) / chunks;

    for (var c = 0; c < chunks; c += 1) {
      var from = Math.floor(c * perChunk);
      var to = c === chunks - 1 ? count - 1 : Math.ceil((c + 1) * perChunk);
      if (to <= from) continue;

      var t = (c + 0.5) / chunks;
      ctx.strokeStyle = blurColor ? blurColor : routeColorAt(t, alpha);
      if (blur) {
        ctx.shadowBlur = blur;
        ctx.shadowColor = routeColorAt(t, 0.9);
      }
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(routeBuffer[from * 2], routeBuffer[from * 2 + 1]);
      for (var i = from + 1; i <= to; i += 1) {
        ctx.lineTo(routeBuffer[i * 2], routeBuffer[i * 2 + 1]);
      }
      ctx.stroke();
    }
  }

  /**
   * The line, in four passes.
   *
   * A single stroke on satellite imagery is invisible over pale ground and
   * garish over dark. The dark casing is what makes one colour work over
   * both; the glow is what makes it look lit rather than drawn; the white
   * core is what survives WhatsApp's compression.
   */
  function paintRoute(frame, projector) {
    var count = buildRoutePoints(frame, projector);
    if (count < 2) return;

    // The finale is about the figure, not the map, but the shape of the day
    // is the reason anyone watched, so it stays visible underneath rather
    // than being wiped. The scrim in paintStats does the legibility work;
    // this only takes the glare off.
    //
    // Keyed to whichever of the two closing overlays is up. Keying it to the
    // stats alone let the route flare back to full brightness under the
    // closing wordmark, where the stats have already faded out.
    var dim = 1 - overlayVeil(frame) * 0.28;
    if (dim <= 0.05) return;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 1, glow
    ctx.globalCompositeOperation = 'lighter';
    strokeAlongRoute(count, 22 * U, 0.28 * dim, 46 * U);

    // 2, casing
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    strokeAlongRoute(count, 19 * U, 1, 0, 'rgba(6,9,16,' + 0.55 * dim + ')');

    // 3, the line itself
    strokeAlongRoute(count, 11 * U, dim, 0);

    // 4, hot core
    strokeAlongRoute(count, 3.2 * U, 1, 0, 'rgba(255,255,255,' + 0.72 * dim + ')');

    if (frame.flash > 0) paintFlash(frame, count);
    ctx.restore();
  }

  /**
   * A light running the length of the finished route at the reveal. The one
   * purely decorative flourish in the film, and the moment people replay.
   */
  function paintFlash(frame, count) {
    var span = 0.16;
    var head = frame.flash * (1 + span);
    var from = Math.floor(clamp01(head - span) * (count - 1));
    var to = Math.ceil(clamp01(head) * (count - 1));
    if (to - from < 1) return;

    var fade = 1 - Math.max(0, (frame.flash - 0.75) / 0.25);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255,255,255,0.95)';
    ctx.shadowBlur = 40 * U;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * fade) + ')';
    ctx.lineWidth = 8 * U;
    ctx.beginPath();
    ctx.moveTo(routeBuffer[from * 2], routeBuffer[from * 2 + 1]);
    for (var i = from + 1; i <= to; i += 1) {
      ctx.lineTo(routeBuffer[i * 2], routeBuffer[i * 2 + 1]);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The moving point. Everything else follows it, so it has to read instantly. */
  function paintHead(frame, projector) {
    // Nothing has been drawn yet during the establishing shot, and a marker
    // sitting on an empty map there reads as a dropped pin rather than the
    // start of a line.
    if (frame.progress <= 0) return;
    // Fades out under the finale along with the route it belongs to.
    var fade = 1 - overlayVeil(frame) * 0.85;
    if (fade <= 0.05) return;
    var scratch = [0, 0];
    projector.project(frame.headX, frame.headY, scratch);
    var x = scratch[0];
    var y = scratch[1];

    // Breathes on the frame index, not the wall clock: the preview and the
    // export have to pulse in the same places.
    var breath = 1 + Math.sin(frame.index * 0.22) * 0.09;
    var glow = Math.max(0.001, frame.headGlow) * breath;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.globalCompositeOperation = 'lighter';
    var halo = ctx.createRadialGradient(x, y, 0, x, y, 74 * U * glow);
    halo.addColorStop(0, 'rgba(255,255,255,0.55)');
    halo.addColorStop(0.35, withAlpha(COLOR_ACCENT, 0.42));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, 74 * U * glow, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 4 * U;
    ctx.beginPath();
    ctx.arc(x, y, 17 * U * breath, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x, y, 9 * U, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * How much of a closing overlay is up, 0..1. The map and the line recede
   * behind either of them.
   */
  function overlayVeil(frame) {
    return clamp01(Math.max(frame.stats, frame.signature));
  }

  /** Darkens the edges so the eye stays where the line is. */
  function paintVignette(frame) {
    var amount = frame.vignette;
    if (amount <= 0) return;
    var gradient = ctx.createRadialGradient(
      W / 2, H * ANCHOR_Y, H * 0.16,
      W / 2, H * ANCHOR_Y, H * 0.82
    );
    gradient.addColorStop(0, 'rgba(8,11,18,0)');
    gradient.addColorStop(1, 'rgba(8,11,18,' + clamp01(amount * 1.25) + ')');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    if (amount > 0.45) {
      ctx.fillStyle = 'rgba(8,11,18,' + clamp01((amount - 0.45) * 1.4) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ------------------------------------------------------------------ HUD --

  function pill(x, y, label, minWidth) {
    ctx.font = '600 ' + Math.round(34 * U) + 'px ' + FONT;
    var width = Math.max(minWidth || 0, ctx.measureText(label).width + 52 * U);
    var height = 68 * U;

    ctx.save();
    ctx.fillStyle = 'rgba(8,11,18,0.52)';
    roundRect(ctx, x, y, width, height, height / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.5 * U;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 26 * U, y + height / 2 + 1 * U);
    ctx.restore();
    return width;
  }

  function paintHud(frame) {
    if (frame.hud <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = frame.hud;

    var margin = 56 * U;
    var top = 92 * U;

    var used = pill(margin, top, formatKm(frame.metres * (film.hudDistanceScale || 1)));
    pill(margin + used + 16 * U, top, formatDuration(frame.elapsed));

    // Wordmark, small and always present, this is the whole reason the video
    // exists as a growth surface.
    ctx.font = '700 ' + Math.round(34 * U) + 'px ' + FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12 * U;
    ctx.fillText(brand.wordmark || 'Dinamique', W - margin, top + 34 * U);
    ctx.restore();

    // Progress hairline across the very top.
    ctx.save();
    ctx.globalAlpha = frame.hud;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(0, 0, W, 6 * U);
    var bar = ctx.createLinearGradient(0, 0, W, 0);
    bar.addColorStop(0, COLOR_PRIMARY);
    bar.addColorStop(1, COLOR_ACCENT);
    ctx.fillStyle = bar;
    ctx.fillRect(0, 0, W * clamp01(frame.progress), 6 * U);
    ctx.restore();
  }

  function paintTitle(frame) {
    if (frame.title <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = clamp01(frame.title);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    var centreY = H * 0.44;
    var scrim = ctx.createRadialGradient(W / 2, centreY, 0, W / 2, centreY, W * 0.85);
    scrim.addColorStop(0, 'rgba(8,11,18,0.72)');
    scrim.addColorStop(1, 'rgba(8,11,18,0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, H);

    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 26 * U;

    ctx.font = '600 ' + Math.round(30 * U) + 'px ' + FONT;
    ctx.fillStyle = withAlpha(COLOR_ACCENT, 0.95);
    ctx.fillText('JORNADA', W / 2, centreY - 96 * U);

    var name = stats.driverName || 'Minha jornada';
    ctx.font = '700 ' + Math.round(76 * U) + 'px ' + FONT;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(name, W / 2, centreY);

    ctx.font = '400 ' + Math.round(36 * U) + 'px ' + FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.fillText(stats.dateLabel || '', W / 2, centreY + 62 * U);
    ctx.restore();
  }

  /**
   * The finale.
   *
   * The hero figure counts up once, here. It is labelled "lucro estimado"
   * because that is what it is, recurring costs are apportioned, not
   * observed, and gross revenue sits in a tile below it under its own name.
   * A tile with no denominator shows a dash and why, exactly as it does in the
   * app; a video is the worst possible place to start inventing figures,
   * because a video is what gets quoted.
   */
  function paintStats(frame) {
    if (frame.stats <= 0.01) return;
    var alpha = clamp01(frame.stats);
    var rise = (1 - clamp01(frame.stats)) * 70 * U;

    // A scrim under the block, on top of the map.
    //
    // The vignette darkens the edges and leaves the middle clear, which is
    // exactly where the figure goes, and a route can be any shape, so
    // sooner or later one runs straight through the money. This is the pass
    // that guarantees the number is legible whatever the day looked like.
    ctx.save();
    ctx.globalAlpha = alpha;
    var scrim = ctx.createLinearGradient(0, H * 0.28, 0, H * 0.92);
    scrim.addColorStop(0, 'rgba(6,9,16,0)');
    scrim.addColorStop(0.22, 'rgba(6,9,16,0.62)');
    scrim.addColorStop(0.8, 'rgba(6,9,16,0.76)');
    scrim.addColorStop(1, 'rgba(6,9,16,0.42)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, H * 0.28, W, H * 0.64);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(0, rise);
    ctx.textAlign = 'center';

    var top = H * 0.42;

    ctx.font = '600 ' + Math.round(28 * U) + 'px ' + FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 18 * U;
    ctx.fillText('LUCRO ESTIMADO DA JORNADA', W / 2, top);

    var shown = Math.round(stats.netProfit * clamp01(frame.statsReveal));
    ctx.font = '700 ' + Math.round(118 * U) + 'px ' + FONT;
    ctx.fillStyle = stats.netProfit < 0 ? '#F2626B' : '#34C77B';
    ctx.shadowColor = stats.netProfit < 0 ? 'rgba(242,98,107,0.35)' : 'rgba(52,199,123,0.35)';
    ctx.shadowBlur = 36 * U;
    ctx.fillText(formatCents(shown), W / 2, top + 108 * U);
    ctx.restore();

    var metrics = stats.metrics || [];
    var columns = 2;
    var cardWidth = (W - 56 * U * 2 - 20 * U) / columns;
    var cardHeight = 148 * U;
    var gridTop = top + 176 * U;

    for (var i = 0; i < metrics.length; i += 1) {
      var column = i % columns;
      var row = Math.floor(i / columns);
      var x = 56 * U + column * (cardWidth + 20 * U);
      var y = gridTop + row * (cardHeight + 20 * U);
      // Cards land one after another rather than all at once, the stagger is
      // what makes the block read as arriving instead of appearing.
      var appear = clamp01((frame.stats - i * 0.06) / 0.7);
      paintMetricCard(metrics[i], x, y + (1 - appear) * 34 * U, cardWidth, cardHeight, alpha * appear);
    }
  }

  function paintMetricCard(metric, x, y, width, height, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    roundRect(ctx, x, y, width, height, 28 * U);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5 * U;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 ' + Math.round(24 * U) + 'px ' + FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.fillText(String(metric.label || '').toUpperCase(), x + 28 * U, y + 50 * U);

    if (metric.value) {
      ctx.font = '700 ' + Math.round(44 * U) + 'px ' + FONT;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(metric.value, x + 28 * U, y + 110 * U);
    } else {
      ctx.font = '700 ' + Math.round(44 * U) + 'px ' + FONT;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('–', x + 28 * U, y + 106 * U);
      ctx.font = '400 ' + Math.round(22 * U) + 'px ' + FONT;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(metric.reason || '', x + 68 * U, y + 106 * U);
    }
    ctx.restore();
  }

  function paintSignature(frame) {
    if (frame.signature <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = clamp01(frame.signature);
    ctx.textAlign = 'center';

    var centreY = H * 0.5;
    var scale = 0.94 + clamp01(frame.signature) * 0.06;
    ctx.translate(W / 2, centreY);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -centreY);

    var glow = ctx.createRadialGradient(W / 2, centreY, 0, W / 2, centreY, W * 0.6);
    glow.addColorStop(0, withAlpha(COLOR_PRIMARY, 0.4));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.font = '700 ' + Math.round(92 * U) + 'px ' + FONT;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 30 * U;
    ctx.fillText(brand.wordmark || 'Dinamique', W / 2, centreY);

    ctx.font = '500 ' + Math.round(34 * U) + 'px ' + FONT;
    ctx.fillStyle = withAlpha(COLOR_ACCENT, 0.95);
    ctx.fillText(brand.handle || 'dinamique.com.br', W / 2, centreY + 62 * U);

    ctx.font = '400 ' + Math.round(26 * U) + 'px ' + FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Quanto você realmente ganhou hoje', W / 2, centreY + 120 * U);
    ctx.restore();
  }

  function paintAttribution(frame) {
    if (!basemap.attribution || frame.vignette > 0.8) return;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.font = '400 ' + Math.round(20 * U) + 'px ' + FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 8 * U;
    ctx.fillText(basemap.attribution, W - 24 * U, H - 20 * U);
    ctx.restore();
  }

  function paint(index, allowLoad) {
    var frame = frameAt(index);
    var projector = makeProjector(frame);

    paintBackdrop(frame);
    paintTiles(frame, allowLoad !== false);
    if (film.pathDistances.length >= 2) {
      paintRoute(frame, projector);
      paintHead(frame, projector);
    }
    paintVignette(frame);
    paintHud(frame);
    paintTitle(frame);
    paintStats(frame);
    paintSignature(frame);
    paintAttribution(frame);
  }

  // ---------------------------------------------------------------- player --

  var playing = false;
  var startedAt = 0;
  var pausedAt = 0;
  var rafHandle = 0;

  function currentIndex(now) {
    var elapsed = now - startedAt;
    var index = Math.floor((elapsed / 1000) * film.fps);
    if (options.loop === false) return clamp(index, 0, film.frameCount - 1);
    return ((index % film.frameCount) + film.frameCount) % film.frameCount;
  }

  function tick() {
    if (!playing) return;
    var index = currentIndex(performance.now());
    paint(index, true);
    post({ type: 'frame', index: index, total: film.frameCount });
    if (options.loop === false && index >= film.frameCount - 1) {
      playing = false;
      post({ type: 'ended' });
      return;
    }
    rafHandle = requestAnimationFrame(tick);
  }

  function play() {
    if (playing) return;
    playing = true;
    startedAt = performance.now() - pausedAt;
    rafHandle = requestAnimationFrame(tick);
  }

  function pause() {
    if (!playing) return;
    playing = false;
    pausedAt = performance.now() - startedAt;
    cancelAnimationFrame(rafHandle);
  }

  function seek(index) {
    pausedAt = (clamp(index, 0, film.frameCount - 1) / film.fps) * 1000;
    startedAt = performance.now() - pausedAt;
    paint(index, true);
  }

  // ------------------------------------------------------------- recording --

  /**
   * Warms the tile cache before recording.
   *
   * Without this the export is a slideshow of grey squares that fill in as it
   * goes, because MediaRecorder does not wait for an <img> to load. Sampling
   * every third frame is enough: consecutive frames overlap almost entirely,
   * and the ones between are covered by their neighbours.
   */
  function preloadTiles(onProgress) {
    if (!basemap.urlTemplate) return Promise.resolve();

    var wanted = {};
    var order = [];
    for (var i = 0; i < film.frameCount; i += 3) {
      var needed = tilesForFrame(frameAt(i));
      for (var j = 0; j < needed.length; j += 1) {
        var key = tileKey(needed[j][0], needed[j][1], needed[j][2]);
        if (!wanted[key]) {
          wanted[key] = true;
          order.push(needed[j]);
        }
      }
    }

    // A very long route at high zoom could ask for thousands of tiles. Past a
    // few hundred we stop preloading and let the rest stream in: better a
    // couple of soft frames than a driver watching a spinner for a minute.
    if (order.length > 520) order = order.slice(0, 520);

    var loaded = 0;
    var CONCURRENCY = 6;
    var cursor = 0;

    return new Promise(function (resolve) {
      if (order.length === 0) {
        resolve();
        return;
      }
      var settled = 0;
      function next() {
        if (cursor >= order.length) return;
        var tile = order[cursor];
        cursor += 1;
        var image = new Image();
        image.crossOrigin = 'anonymous';
        var key = tileKey(tile[0], tile[1], tile[2]);
        var entry = { image: image, ok: false, failed: false };
        tiles[key] = entry;

        var done = false;
        function finish(ok) {
          if (done) return;
          done = true;
          entry.ok = ok;
          entry.failed = !ok;
          loaded += 1;
          settled += 1;
          if (onProgress) onProgress(loaded / order.length);
          if (settled >= order.length) resolve();
          else next();
        }
        image.onload = function () { finish(true); };
        image.onerror = function () { finish(false); };
        // A tile server that hangs must not hang the export.
        setTimeout(function () { finish(entry.ok); }, 12000);
        image.src = tileUrl(tile[0], tile[1], tile[2]);
      }
      for (var k = 0; k < CONCURRENCY; k += 1) next();
    });
  }

  /**
   * Format preference, best first.
   *
   * MP4 wherever it is offered, because it is the only container every
   * destination a driver will pick actually accepts, WhatsApp on iOS will
   * not send a WebM as a video, it sends it as a file, which defeats the
   * whole point. Chromium has muxed MP4 from MediaRecorder for a while now;
   * WebM is the fallback for the versions that do not.
   */
  var MIME_PREFERENCE = [
    'video/mp4;codecs=avc1.4d002a',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    for (var i = 0; i < MIME_PREFERENCE.length; i += 1) {
      try {
        if (MediaRecorder.isTypeSupported(MIME_PREFERENCE[i])) return MIME_PREFERENCE[i];
      } catch (error) {
        /* isTypeSupported throws on some older WebViews rather than returning false. */
      }
    }
    return '';
  }

  function nextFrame() {
    return new Promise(function (resolve) { requestAnimationFrame(function () { resolve(); }); });
  }

  function record() {
    pause();

    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
      post({ type: 'error', code: 'unsupported', message: 'Este aparelho não consegue gravar o vídeo.' });
      return;
    }

    var mime = pickMime();
    post({ type: 'progress', phase: 'tiles', value: 0 });

    preloadTiles(function (value) {
      post({ type: 'progress', phase: 'tiles', value: value });
    }).then(function () {
      // Captured at a fixed rate and painted against the wall clock.
      //
      // The tempting alternative, captureStream(0) plus requestFrame(), one
      // encoded frame per painted frame, is wrong here, and subtly. A
      // MediaRecorder timestamps frames when they arrive, not by any nominal
      // rate, so on a phone that paints at 18 fps that route produces every
      // frame of the film stretched over 36 seconds instead of 22. The film
      // would be complete and the pacing ruined, which for something whose
      // whole job is rhythm is the worse failure. Mapping elapsed time to a
      // frame index instead means a slow device drops frames and keeps the
      // timing, exactly like video playback everywhere else.
      var stream = canvas.captureStream(film.fps);

      var settings = { videoBitsPerSecond: options.bitrate || 6000000 };
      if (mime) settings.mimeType = mime;

      var recorder;
      try {
        recorder = new MediaRecorder(stream, settings);
      } catch (error) {
        try {
          recorder = new MediaRecorder(stream);
        } catch (fallbackError) {
          post({ type: 'error', code: 'unsupported', message: 'Este aparelho não consegue gravar o vídeo.' });
          return;
        }
      }

      var parts = [];
      recorder.ondataavailable = function (event) {
        if (event.data && event.data.size > 0) parts.push(event.data);
      };
      recorder.onstop = function () {
        deliver(new Blob(parts, { type: recorder.mimeType || mime || 'video/webm' }));
      };
      recorder.onerror = function () {
        post({ type: 'error', code: 'recorder', message: 'A gravação falhou no meio.' });
      };

      // Paint frame zero and give the encoder a moment before starting, so
      // the first thing in the file is the composed opening rather than
      // whatever was on the canvas when the driver hit the button.
      paint(0, false);

      setTimeout(function () {
        recorder.start();
        var began = performance.now();
        var lastPainted = -1;

        function step() {
          var elapsed = performance.now() - began;
          var index = Math.floor((elapsed / 1000) * film.fps);

          if (index >= film.frameCount) {
            paint(film.frameCount - 1, false);
            // A beat of slack so the last painted frame is actually captured
            // and the encoder flushes before the container is closed.
            setTimeout(function () { recorder.stop(); }, 260);
            return;
          }

          if (index !== lastPainted) {
            paint(index, false);
            lastPainted = index;
            if (index % 6 === 0) {
              post({ type: 'progress', phase: 'render', value: index / film.frameCount });
            }
          }
          nextFrame().then(step);
        }
        nextFrame().then(step);
      }, 120);
    });
  }

  /**
   * Hands the finished file to the host.
   *
   * On the web the blob becomes an object URL and the page downloads it. In a
   * WebView there is no shared memory with React Native, so the only route is
   * base64 over postMessage, chunked, because a single 8 MB string across
   * the bridge is where Android WebViews start dropping messages silently.
   */
  function deliver(blob) {
    post({ type: 'progress', phase: 'encode', value: 1 });

    if (options.deliver === 'objectUrl') {
      post({ type: 'done', mime: blob.type, url: URL.createObjectURL(blob), size: blob.size });
      return;
    }

    var reader = new FileReader();
    reader.onerror = function () {
      post({ type: 'error', code: 'read', message: 'Não foi possível ler o vídeo gerado.' });
    };
    reader.onload = function () {
      var result = String(reader.result || '');
      var comma = result.indexOf(',');
      var base64 = comma >= 0 ? result.slice(comma + 1) : result;

      // 3-byte alignment keeps every chunk independently valid base64, so the
      // host can concatenate without decoding.
      var CHUNK = 196608;
      var total = Math.ceil(base64.length / CHUNK) || 1;
      post({ type: 'begin', mime: blob.type, size: blob.size, chunks: total });

      var sent = 0;
      function pump() {
        if (sent >= total) {
          post({ type: 'done', mime: blob.type, chunks: total, size: blob.size });
          return;
        }
        post({ type: 'chunk', index: sent, total: total, data: base64.substr(sent * CHUNK, CHUNK) });
        sent += 1;
        // Yielding between chunks keeps the bridge from being flooded, which
        // is what causes the silent drops.
        setTimeout(pump, 0);
      }
      pump();
    };
    reader.readAsDataURL(blob);
  }

  // ----------------------------------------------------------------- boot --

  window.recap = {
    play: play,
    pause: pause,
    seek: seek,
    record: record,
    frameCount: film.frameCount,
    durationMs: film.durationMs
  };

  paint(0, true);
  post({ type: 'ready', frameCount: film.frameCount, durationMs: film.durationMs, fps: film.fps });
  if (options.autoplay !== false) play();
})();
`;
