/**
 * A minimal MP4 writer for one H.264 video track.
 *
 * Shipped as a string, like the painter, and evaluated in front of it inside
 * the recap document. It exists because of how the film used to be recorded:
 * a MediaRecorder on the canvas, in real time. A phone that paints eighteen
 * frames a second hands that recorder eighteen frames a second, stamped with
 * the moment each one arrived, and the file comes out choppy and with an
 * uneven clock. WhatsApp re-encodes what it is given, and an uneven clock is
 * what it turned into a slow, stuttering clip.
 *
 * With WebCodecs the painter encodes frame N with the timestamp of frame N,
 * however long it took to paint, so every frame of the film is in the file
 * and the file runs at exactly the film's rate. What WebCodecs does not do is
 * write a container, which is this file: the encoded samples in, a playable
 * MP4 with the index in front (what a player needs to start before the last
 * byte arrives) out.
 *
 * Same rules as the painter: ES5, no backticks, no interpolation.
 *
 *   window.__RECAP_MP4__.mux({
 *     width, height, timescale,
 *     description,          // avcC bytes, from the encoder's decoderConfig
 *     samples: [{ data, pts, duration, key }],  // in decode order, pts in timescale units
 *   }) -> Uint8Array
 */
export const MP4_SOURCE = `
window.__RECAP_MP4__ = (function () {
  'use strict';

  function ascii(text) {
    var out = [];
    for (var i = 0; i < text.length; i += 1) out.push(text.charCodeAt(i) & 255);
    return out;
  }

  function u8(value) { return [value & 255]; }
  function u16(value) { return [(value >>> 8) & 255, value & 255]; }
  function u32(value) {
    return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
  }
  function zeros(count) {
    var out = [];
    for (var i = 0; i < count; i += 1) out.push(0);
    return out;
  }

  /** Flattens numbers, arrays of numbers and Uint8Arrays into one Uint8Array. */
  function bytes(parts) {
    var length = 0;
    var i;
    for (i = 0; i < parts.length; i += 1) {
      length += typeof parts[i] === 'number' ? 1 : parts[i].length;
    }
    var out = new Uint8Array(length);
    var offset = 0;
    for (i = 0; i < parts.length; i += 1) {
      var part = parts[i];
      if (typeof part === 'number') {
        out[offset] = part;
        offset += 1;
      } else if (part instanceof Uint8Array) {
        out.set(part, offset);
        offset += part.length;
      } else {
        for (var j = 0; j < part.length; j += 1) out[offset + j] = part[j];
        offset += part.length;
      }
    }
    return out;
  }

  function box(type, parts) {
    var body = bytes(parts || []);
    return bytes([u32(body.length + 8), ascii(type), body]);
  }

  function fullBox(type, version, flags, parts) {
    return box(type, [u8(version), u8(flags >>> 16), u16(flags & 65535)].concat(parts || []));
  }

  /** The identity matrix, as every header that carries one wants it. */
  var MATRIX = [].concat(
    u32(0x00010000), u32(0), u32(0),
    u32(0), u32(0x00010000), u32(0),
    u32(0), u32(0), u32(0x40000000)
  );

  /** Movie-header timescale; the track keeps its own, finer one. */
  var MOVIE_TIMESCALE = 1000;

  function mux(input) {
    var samples = input.samples;
    var timescale = input.timescale;
    var count = samples.length;
    if (count === 0) throw new Error('mp4: no samples');

    // Decode times are the samples in arrival order, back to back. An encoder
    // that reorders frames (B-frames) hands out presentation stamps that run
    // ahead of or behind those, and the difference goes in ctts. Shifted so
    // no offset is negative; the edit list then hides the shift from the
    // player, so the first frame still shows at zero.
    var dts = 0;
    var offsets = [];
    var minOffset = 0;
    var reordered = false;
    var trackDuration = 0;
    var i;
    for (i = 0; i < count; i += 1) {
      var offset = samples[i].pts - dts;
      if (offset !== 0) reordered = true;
      if (offset < minOffset) minOffset = offset;
      offsets.push(offset);
      dts += samples[i].duration;
      var end = samples[i].pts + samples[i].duration;
      if (end > trackDuration) trackDuration = end;
    }
    var shift = -minOffset;
    var movieDuration = Math.round((trackDuration * MOVIE_TIMESCALE) / timescale);
    // The media timeline runs on composition times, which the shift moves
    // later; the edit list plays [shift, shift + trackDuration) of it, so
    // the media has to declare that it reaches the end of that window.
    var mediaDuration = trackDuration + shift;

    // stts: runs of equal durations.
    var stts = [];
    var runs = 0;
    for (i = 0; i < count; ) {
      var run = 1;
      while (i + run < count && samples[i + run].duration === samples[i].duration) run += 1;
      stts.push(u32(run), u32(samples[i].duration));
      runs += 1;
      i += run;
    }

    var keys = [];
    var sizes = [];
    var mdatLength = 0;
    for (i = 0; i < count; i += 1) {
      if (samples[i].key) keys.push(u32(i + 1));
      sizes.push(u32(samples[i].data.length));
      mdatLength += samples[i].data.length;
    }

    var ctts = null;
    if (reordered) {
      var entries = [];
      for (i = 0; i < count; i += 1) entries.push(u32(1), u32(offsets[i] + shift));
      ctts = fullBox('ctts', 0, 0, [u32(count)].concat(entries));
    }

    var avc1 = box('avc1', [
      zeros(6), u16(1),            // reserved, data_reference_index
      zeros(16),                   // pre_defined, reserved, pre_defined
      u16(input.width), u16(input.height),
      u32(0x00480000), u32(0x00480000), // 72 dpi
      u32(0), u16(1),              // reserved, frame_count
      zeros(32),                   // compressorname
      u16(0x0018), u16(0xffff),    // depth, pre_defined
      box('avcC', [input.description])
    ]);

    function stbl(chunkOffset) {
      return box('stbl', [
        fullBox('stsd', 0, 0, [u32(1), avc1]),
        fullBox('stts', 0, 0, [u32(runs)].concat(stts)),
        ctts || [],
        fullBox('stss', 0, 0, [u32(keys.length)].concat(keys)),
        fullBox('stsc', 0, 0, [u32(1), u32(1), u32(count), u32(1)]),
        fullBox('stsz', 0, 0, [u32(0), u32(count)].concat(sizes)),
        fullBox('stco', 0, 0, [u32(1), u32(chunkOffset)])
      ]);
    }

    function moov(chunkOffset) {
      var edts = shift > 0
        ? box('edts', [
            fullBox('elst', 0, 0, [u32(1), u32(movieDuration), u32(shift), u16(1), u16(0)])
          ])
        : [];
      return box('moov', [
        fullBox('mvhd', 0, 0, [
          u32(0), u32(0), u32(MOVIE_TIMESCALE), u32(movieDuration),
          u32(0x00010000), u16(0x0100), zeros(10),
          MATRIX, zeros(24), u32(2)
        ]),
        box('trak', [
          fullBox('tkhd', 0, 3, [
            u32(0), u32(0), u32(1), u32(0), u32(movieDuration),
            zeros(8), u16(0), u16(0), u16(0), u16(0),
            MATRIX, u32(input.width * 65536), u32(input.height * 65536)
          ]),
          edts,
          box('mdia', [
            fullBox('mdhd', 0, 0, [
              u32(0), u32(0), u32(timescale), u32(mediaDuration),
              u16(0x55c4), u16(0)  // 'und'
            ]),
            fullBox('hdlr', 0, 0, [u32(0), ascii('vide'), zeros(12), ascii('VideoHandler'), u8(0)]),
            box('minf', [
              fullBox('vmhd', 0, 1, [zeros(8)]),
              box('dinf', [fullBox('dref', 0, 0, [u32(1), fullBox('url ', 0, 1)])]),
              stbl(chunkOffset)
            ])
          ])
        ])
      ]);
    }

    var ftyp = box('ftyp', [ascii('isom'), u32(0x200), ascii('isom'), ascii('iso2'), ascii('avc1'), ascii('mp41')]);
    // The index goes in front of the media. Its size does not depend on the
    // offset it carries, so measuring it once with a placeholder is exact.
    var head = moov(0).length;
    var index = moov(ftyp.length + head + 8);

    var out = new Uint8Array(ftyp.length + index.length + 8 + mdatLength);
    var at = 0;
    out.set(ftyp, at); at += ftyp.length;
    out.set(index, at); at += index.length;
    out.set(bytes([u32(mdatLength + 8), ascii('mdat')]), at); at += 8;
    for (i = 0; i < count; i += 1) {
      out.set(samples[i].data, at);
      at += samples[i].data.length;
    }
    return out;
  }

  return { mux: mux };
})();
`;
