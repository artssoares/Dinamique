# @dinamique/recap

The journey recap film, the twenty seconds a driver sends to a group chat.

## Why it exists

Drivers already share this kind of thing. Relive is the reference, and the
reason it spreads is not the satellite imagery: it is that the line is
**drawn** while you watch, the camera **turns with the road** so the route
always flows up the screen, and it periodically **pulls back** to show the
shape you have made so far. Those three things are the product; everything
here serves them.

The recap is also the only surface in Dinamique whose job is to be seen by
people who do not have the app.

## Three layers, deliberately not mixed

```
geo + track + polyline    what happened, cleaned up
storyboard + film         how the camera moves through it, precomputed
painter + renderer        what it looks like, as one self-contained document
```

Nothing in this package touches Supabase, React or React Native. The app
fetches rows and calls `buildRecap`; what comes back is an HTML string and the
numbers that describe it. That is what lets the entire choreography be tested
without a canvas anywhere near the test, and lets the same document render
identically in a WebView on a phone and an iframe on the web.

### `geo` / `polyline` / `track`

A raw GPS trace is not a route: it contains fixes taken at a traffic light that
wander twenty metres, a cell-tower guess that lands in the next municipality,
and silences where the app was backgrounded. `buildTrack` drops what cannot be
true, simplifies what carries no shape, and computes a forward-looking,
twice-smoothed heading, the thing that stops the follow-cam arriving at every
corner late.

The app stores one route per journey in `journey_routes`: an encoded polyline
(precision 5, about 1.1 m) with no timestamps. `fixesFromRoute` turns that into
the timed fixes the film needs by spreading the journey's clock over the route
in proportion to distance, so the head moves at one steady pace between the
start and the end of the shift. The kilometres and the total time are real;
only the pace inside the shift is smoothed. `fixesFromSegments` remains for the
older batch shape (polyline plus delta-encoded millisecond offsets).

### `storyboard` / `film`

`buildStoryboard` lays out five chapters, opening, drive, reveal, numbers,
signature, and `sampleFrame` is a pure function from a millisecond to a
camera. `buildFilm` evaluates it once per frame ahead of time.

Precomputing buys two things. The choreography stays in TypeScript under test
rather than duplicated inside a template literal, and frame N is frame N: the
player and the recorder both map their clock to an index, so a slow phone
produces the same film with fewer of its frames in it, never a different one
and never one that runs long.

### `painter` / `renderer`

`PAINTER_SOURCE` is plain browser JavaScript shipped as a string. Two
constraints on editing it, both load-bearing:

- **No backticks and no `${`**, the whole thing lives inside a template
  literal, so string concatenation is not a style choice.
- **No `Math.random()`, no `Date.now()` in anything that draws.** A frame must
  depend only on its index.

`renderRecapDocument` wraps the film and the painter into one page with no
external references at all, no server, no bundler, no CDN, asserted by test.

## The two rules the video inherits

A shared number is the one people quote, so PRODUCT_RULES survives into the
film intact:

- **Gross revenue is never called profit.** The hero figure is labelled *lucro
  estimado*; faturamento sits below it under its own name.
- **A metric with no denominator is a dash and a reason**, never a zero.

This is also why the money does not count up alongside the head. We know what
the day earned; we do not know what it had earned by the corner of Faria Lima,
and animating a number through values nobody measured would be inventing data
for decoration. The money lands once, at the end.

## The basemap is configuration

`ESRI_WORLD_IMAGERY` is the default the app ships with: Esri's World Imagery
raster tiles, no key, CORS on, attribution drawn on every frame. The app can
swap the provider with `EXPO_PUBLIC_FILM_TILES_URL` (a `{z}/{x}/{y}` template,
see `apps/mobile/src/features/film/basemap.ts`); an empty value selects the
tileless variant, a dark field with the route glowing on it, which is a
designed fallback rather than a failure.

`preview/testar-mapa.html` checks a candidate URL against both requirements
below before anyone wires it into an environment, open it in a browser and
paste the template. Worth using rather than eyeballing: a provider without
CORS still *shows* the map, so the failure only surfaces at the end of an
export, and the browser reports it identically to a wrong key.

Any provider must satisfy two things:

- **CORS.** A canvas that has drawn one image without
  `Access-Control-Allow-Origin` is tainted permanently and cannot be captured.
  The export would fail at the last step, after the driver waited through the
  whole render.
- **A licence that permits redistribution.** The frame ends up in a WhatsApp
  group. That is redistribution. Attribution is drawn on every frame.

## Recording

`window.recap.record()` preloads the tiles the film will need, then captures
`canvas.captureStream(fps)` through a `MediaRecorder`, preferring MP4, the
only container every destination a driver will pick actually accepts.

Painting is driven by the wall clock rather than by a frame counter with
`requestFrame()`. A `MediaRecorder` timestamps frames when they arrive, so the
counter approach produces every frame of the film stretched over 36 seconds on
a phone that paints at 18 fps: complete, and ruined. Mapping elapsed time to an
index instead drops frames and keeps the timing, like video playback
everywhere else.

The finished file crosses to React Native as base64 in 3-byte-aligned chunks,
so the host can concatenate without decoding. It is generated entirely on the
device; nothing is uploaded to render it.

## Previewing a change

The package has no visual test, a canvas cannot assert that something is
beautiful. `preview/` is the tool for looking instead:

```
pnpm --filter @dinamique/recap run preview          # → /tmp/preview.html
PREVIEW_TILES='https://…/{z}/{x}/{y}.jpg?key=…' \
  pnpm --filter @dinamique/recap run preview        # com imagens de satélite
```

It renders the demo journey exactly as it sits in the database (the polyline
in `preview/demoRoute.ts` is the `journey_routes` row of the journey marked
`note = 'demo-recap'`, kept on today's date by `seed/002_demo_route.sql`), read
through the same `fixesFromRoute` adapter the app uses, so what you look at is
what someone testing in the app sees on Histórico. `PREVIEW_TILES=` (empty)
renders it without imagery. Open the file in a browser: `window.recap.seek(n)` holds any frame and
`window.recap.record()` runs the real export path.

It lives outside `src/` and outside the CI glob on purpose, it writes a file
and asserts nothing. `sampleFrame` is pure, so a camera move that looks wrong
here can be pinned down in a unit test from the same scene.

The camera assertions in `recap.test.ts` are worth knowing about before
retiming anything: they cap how far the camera may move between two frames,
which is what caught an opening descent that crossed four and a half zoom
levels fast enough to read as a jump cut.
