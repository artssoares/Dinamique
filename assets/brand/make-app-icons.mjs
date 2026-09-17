/**
 * Gera o ícone, a tela de abertura e o ícone de notificação a partir do
 * logotipo oficial. Nada aqui redesenha a marca: o "d." é recortado do próprio
 * arquivo, pixel por pixel, e só é posicionado e escalado.
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const BLUE = [0x01, 0x37, 0xf7];
const WHITE = [0xff, 0xff, 0xff];

// ------------------------------------------------------------------ PNG ----
const table = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function decodePng(file) {
  const b = readFileSync(file);
  const width = b.readUInt32BE(16), height = b.readUInt32BE(20);
  if (b[24] !== 8 || b[25] !== 6 || b[28] !== 0) throw new Error(`${file}: formato inesperado`);

  const parts = [];
  let off = 8;
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') parts.push(b.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += 12 + len;
  }

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * 4;
  const out = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[y * stride + x - 4] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const ul = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (a + up) >> 1;
      else if (filter === 4) {
        const p = a + up - ul;
        const pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - ul);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? up : ul;
      }
      out[y * stride + x] = value & 0xff;
    }
  }
  return { width, height, data: out };
}

// --------------------------------------------------------------- recorte ----
/** Colunas com tinta, agrupadas: cada grupo é uma letra do logotipo. */
function glyphs(img) {
  const inked = [];
  for (let x = 0; x < img.width; x++) {
    let any = false;
    for (let y = 0; y < img.height && !any; y++) {
      if (img.data[(y * img.width + x) * 4 + 3] > 24) any = true;
    }
    inked.push(any);
  }
  const groups = [];
  let start = -1;
  for (let x = 0; x <= img.width; x++) {
    if (inked[x] && start < 0) start = x;
    if (!inked[x] && start >= 0) { groups.push([start, x - 1]); start = -1; }
  }
  return groups;
}

function bounds(img, x0, x1) {
  let top = img.height, bottom = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = x0; x <= x1; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > 24) { if (y < top) top = y; if (y > bottom) bottom = y; }
    }
  }
  return { top, bottom };
}

/** Amostra bilinear do recorte, em coordenadas do recorte (0..1). */
function sample(img, box, u, v) {
  const fx = box.x0 + u * (box.x1 - box.x0);
  const fy = box.y0 + v * (box.y1 - box.y0);
  const x = Math.floor(fx), y = Math.floor(fy);
  if (x < 0 || y < 0 || x >= img.width - 1 || y >= img.height - 1) return [0, 0, 0, 0];
  const dx = fx - x, dy = fy - y;
  const out = [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const p00 = img.data[(y * img.width + x) * 4 + k];
    const p10 = img.data[(y * img.width + x + 1) * 4 + k];
    const p01 = img.data[((y + 1) * img.width + x) * 4 + k];
    const p11 = img.data[((y + 1) * img.width + x + 1) * 4 + k];
    out[k] = p00 * (1 - dx) * (1 - dy) + p10 * dx * (1 - dy) + p01 * (1 - dx) * dy + p11 * dx * dy;
  }
  return out;
}

/**
 * Desenha o "d." centrado num quadrado. `markHeight` é a altura do "d" em
 * fração do lado; o ponto acompanha na mesma escala do logotipo original.
 */
function compose({ size, background, source, d, dot, markHeight }) {
  const canvas = Buffer.alloc(size * size * 4);
  if (background) {
    for (let i = 0; i < size * size; i++) {
      canvas[i * 4] = background[0];
      canvas[i * 4 + 1] = background[1];
      canvas[i * 4 + 2] = background[2];
      canvas[i * 4 + 3] = 255;
    }
  }

  const scale = (size * markHeight) / (d.y1 - d.y0);
  const dW = (d.x1 - d.x0) * scale, dH = (d.y1 - d.y0) * scale;
  const dotW = (dot.x1 - dot.x0) * scale, dotH = (dot.y1 - dot.y0) * scale;
  // O vão entre o "d" e o ponto vale o mesmo que no logotipo: a distância
  // entre o fim de uma letra e o começo da seguinte.
  const gap = source.gap * scale;

  const totalW = dW + gap + dotW;
  const originX = (size - totalW) / 2;
  // As duas formas se apoiam na mesma linha de base do logotipo.
  const baseline = (size + dH) / 2;

  const place = (box, x0, y0, w, h) => {
    for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const [r, g, b, a] = sample(source.img, box, (x + 0.5 - x0) / w, (y + 0.5 - y0) / h);
        if (a <= 0) continue;
        const i = (y * size + x) * 4;
        const alpha = a / 255;
        // O PNG do logotipo não é pré-multiplicado, então a cor já está certa.
        for (let k = 0; k < 3; k++) {
          canvas[i + k] = Math.round(canvas[i + k] * (1 - alpha) + [r, g, b][k] * alpha);
        }
        canvas[i + 3] = Math.min(255, Math.round(canvas[i + 3] + a));
      }
    }
  };

  place(d, originX, baseline - dH, dW, dH);
  place(dot, originX + dW + gap, baseline - dotH, dotW, dotH);
  return encodePng(size, size, canvas);
}

/** O logotipo inteiro, deitado num quadrado, para a tela de abertura. */
function wordmark({ size, background, img, box, width }) {
  const canvas = Buffer.alloc(size * size * 4);
  if (background) {
    for (let i = 0; i < size * size; i++) {
      canvas[i * 4] = background[0];
      canvas[i * 4 + 1] = background[1];
      canvas[i * 4 + 2] = background[2];
      canvas[i * 4 + 3] = 255;
    }
  }
  const w = size * width;
  const h = (w * (box.y1 - box.y0)) / (box.x1 - box.x0);
  const x0 = (size - w) / 2, y0 = (size - h) / 2;
  for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const [r, g, b, a] = sample(img, box, (x + 0.5 - x0) / w, (y + 0.5 - y0) / h);
      if (a <= 0) continue;
      const i = (y * size + x) * 4;
      const alpha = a / 255;
      for (let k = 0; k < 3; k++) {
        canvas[i + k] = Math.round(canvas[i + k] * (1 - alpha) + [r, g, b][k] * alpha);
      }
      canvas[i + 3] = Math.min(255, Math.round(canvas[i + 3] + a));
    }
  }
  return encodePng(size, size, canvas);
}

// ------------------------------------------------------------------ saída ---
const [brandDir, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

function marks(file) {
  const img = decodePng(file);
  const groups = glyphs(img);
  const first = groups[0];
  const last = groups[groups.length - 1];
  const dB = bounds(img, first[0], first[1]);
  const dotB = bounds(img, last[0], last[1]);
  return {
    img,
    // O vão que o próprio logotipo dá ao ponto, e não o vão entre duas letras:
    // é o que mantém o "d." com o espaçamento da marca.
    gap: last[0] - groups[groups.length - 2][1],
    all: { x0: groups[0][0], x1: last[1], y0: Math.min(...groups.map((g) => bounds(img, g[0], g[1]).top)), y1: Math.max(...groups.map((g) => bounds(img, g[0], g[1]).bottom)) },
    d: { x0: first[0], x1: first[1], y0: dB.top, y1: dB.bottom },
    dot: { x0: last[0], x1: last[1], y0: dotB.top, y1: dotB.bottom },
  };
}

const negative = marks(`${brandDir}/logo-negativo.png`);
const positive = marks(`${brandDir}/logo.png`);

// Ícone da loja: o "d." branco sobre o azul da marca, sangrando até a borda.
writeFileSync(`${outDir}/icon.png`, compose({
  size: 1024, background: BLUE, source: negative,
  d: negative.d, dot: negative.dot, markHeight: 0.52,
}));

// Android adaptativo: fundo azul declarado no app.json, marca menor porque o
// sistema recorta a camada da frente num círculo.
writeFileSync(`${outDir}/adaptive-icon.png`, compose({
  size: 1024, background: null, source: negative,
  d: negative.d, dot: negative.dot, markHeight: 0.38,
}));

// Abertura: o logotipo inteiro, que é como a marca deve ser lida quando cabe.
writeFileSync(`${outDir}/splash.png`, wordmark({
  size: 1024, background: WHITE, img: positive.img, box: positive.all, width: 0.62,
}));

writeFileSync(`${outDir}/favicon.png`, compose({
  size: 64, background: BLUE, source: negative,
  d: negative.d, dot: negative.dot, markHeight: 0.52,
}));

// Notificação no Android: só a silhueta, o sistema aplica a cor.
writeFileSync(`${outDir}/notification-icon.png`, compose({
  size: 96, background: null, source: negative,
  d: negative.d, dot: negative.dot, markHeight: 0.52,
}));

console.log('ok');
