/**
 * Gera o ícone, a tela de abertura e o ícone de notificação a partir do
 * logotipo oficial. Nada aqui redesenha a marca: o "d." é recortado do próprio
 * arquivo e só é posicionado e escalado.
 *
 * Por que não é uma interpolação simples. O `logo.png` tem 1168x213 e o alfa
 * dele é BINÁRIO: 94787 pixels opacos, 153997 transparentes, zero meio-tom.
 * São degraus duros, sem antisserrilhado. O ícone da loja precisa do "d" a
 * 3,5 vezes esse tamanho, e ampliar degrau com interpolação bilinear só
 * transforma escada em borda borrada e ondulada.
 *
 * Então a forma é reconstruída por CAMPO DE DISTÂNCIA. Para cada pixel da
 * origem é calculada a distância até a borda mais próxima, com sinal:
 * negativa dentro, positiva fora. Distância interpola bem, ao contrário de
 * uma máscara, então o campo é amostrado no tamanho final e só ali vira
 * cobertura, com a transição ocupando exatamente um pixel de destino. O
 * resultado tem a borda lisa em qualquer escala, e a letra continua sendo a
 * do arquivo oficial.
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const BLUE = [0x01, 0x37, 0xf7];
const WHITE = [0xff, 0xff, 0xff];

/** Quanto do degrau do arquivo original é alisado, em pixels da origem. */
const SMOOTH_SIGMA = Number(process.env.DINAMIQUE_SMOOTH ?? 2.0);

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

/**
 * Distância euclidiana até o pixel marcado mais próximo, pelo algoritmo
 * sequencial de oito pontos (Danielsson): dois varrimentos, cada célula
 * guardando o VETOR até a origem mais próxima em vez da distância. Guardar o
 * vetor é o que mantém a medida exata nas diagonais, onde contar passos erra.
 */
function nearestSites(mask, w, h) {
  const FAR = 1e9;
  const dx = new Int32Array(w * h).fill(FAR);
  const dy = new Int32Array(w * h).fill(FAR);

  for (let i = 0; i < w * h; i++) if (mask[i]) { dx[i] = 0; dy[i] = 0; }

  const d2 = (i) => (dx[i] === FAR ? FAR : dx[i] * dx[i] + dy[i] * dy[i]);
  const pull = (i, j, ox, oy) => {
    if (dx[j] === FAR) return;
    const nx = dx[j] + ox, ny = dy[j] + oy;
    if (nx * nx + ny * ny < d2(i)) { dx[i] = nx; dy[i] = ny; }
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) pull(i, i - 1, 1, 0);
      if (y > 0) pull(i, i - w, 0, 1);
      if (x > 0 && y > 0) pull(i, i - w - 1, 1, 1);
      if (x < w - 1 && y > 0) pull(i, i - w + 1, -1, 1);
    }
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) pull(i, i + 1, -1, 0);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (y < h - 1) pull(i, i + w, 0, -1);
      if (x < w - 1 && y < h - 1) pull(i, i + w + 1, -1, -1);
      if (x > 0 && y < h - 1) pull(i, i + w - 1, 1, -1);
    }
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) pull(i, i - 1, 1, 0);
    }
  }
  return { dx, dy };
}

/**
 * O campo de distância com sinal, mais a cor espalhada.
 *
 * A cor precisa ser espalhada para fora da letra porque, ao amostrar perto da
 * borda, o vizinho transparente entraria na conta e puxaria a cor para o
 * preto. Cada pixel de fora recebe a cor do pixel opaco mais próximo, que o
 * próprio campo já sabe qual é, e aí a borda interpola cor com cor.
 */
function field(img) {
  const { width: w, height: h, data } = img;
  const inside = new Uint8Array(w * h);
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const on = data[i * 4 + 3] > 127;
    inside[i] = on ? 1 : 0;
    outside[i] = on ? 0 : 1;
  }

  const toShape = nearestSites(inside, w, h);
  const toVoid = nearestSites(outside, w, h);

  const sd = new Float32Array(w * h);
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const out = Math.hypot(toShape.dx[i], toShape.dy[i]);
    const inn = Math.hypot(toVoid.dx[i], toVoid.dy[i]);
    // Negativa dentro, positiva fora, zero exatamente na borda.
    sd[i] = out - inn;

    // De onde vem a cor deste ponto: dele mesmo, se for opaco; do pixel opaco
    // mais próximo, se não for.
    const y = (i / w) | 0, x = i % w;
    const src = inside[i] ? i : (y + toShape.dy[i]) * w + (x + toShape.dx[i]);
    const s = Math.max(0, Math.min(w * h - 1, src));
    rgb[i * 3] = data[s * 4];
    rgb[i * 3 + 1] = data[s * 4 + 1];
    rgb[i * 3 + 2] = data[s * 4 + 2];
  }
  return { w, h, sd: smooth(sd, w, h, SMOOTH_SIGMA), rgb };
}

/**
 * Suaviza o campo com uma gaussiana separável.
 *
 * É aqui que a escada do arquivo original some. O contorno do `logo.png` não
 * é liso: ele tem degraus de um a três pixels e alguns pixels soltos, porque
 * o arquivo é um bitmap sem antisserrilhado. Borrar a MÁSCARA só produziria
 * cinza; borrar a DISTÂNCIA move o contorno, e mover um contorno na direção
 * da própria curvatura é exatamente alisar.
 *
 * O sigma é pequeno perto da letra: a haste do "d" tem cerca de 30 pixels de
 * largura na origem, então 1,5 arredonda o degrau e não toca na forma.
 */
function smooth(sd, w, h, sigma) {
  const radius = Math.ceil(sigma * 3);
  const kernel = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(v);
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const clamp = (v, hi) => (v < 0 ? 0 : v > hi ? hi : v);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -radius; i <= radius; i++) acc += sd[y * w + clamp(x + i, w - 1)] * kernel[i + radius];
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -radius; i <= radius; i++) acc += tmp[clamp(y + i, h - 1) * w + x] * kernel[i + radius];
      out[y * w + x] = acc;
    }
  }
  return out;
}

/** Interpolação bilinear de um canal qualquer do campo. */
function bilinear(read, w, h, fx, fy) {
  const x = Math.floor(fx), y = Math.floor(fy);
  const dx = fx - x, dy = fy - y;
  const at = (xx, yy) => read(Math.max(0, Math.min(w - 1, xx)), Math.max(0, Math.min(h - 1, yy)));
  return (
    at(x, y) * (1 - dx) * (1 - dy) +
    at(x + 1, y) * dx * (1 - dy) +
    at(x, y + 1) * (1 - dx) * dy +
    at(x + 1, y + 1) * dx * dy
  );
}

/**
 * Amostra o recorte em coordenadas 0..1 e devolve [r, g, b, a].
 *
 * `perPixel` é quantos pixels da origem cabem num pixel do destino. É ele que
 * define a largura da transição: a borda cobre um pixel de destino, nem mais
 * (borrada) nem menos (serrilhada).
 */
function sampleField(f, box, u, v, perPixel) {
  const fx = box.x0 + u * (box.x1 - box.x0);
  const fy = box.y0 + v * (box.y1 - box.y0);

  const d = bilinear((x, y) => f.sd[y * f.w + x], f.w, f.h, fx, fy);
  const a = Math.max(0, Math.min(1, 0.5 - d / Math.max(perPixel, 1e-6)));
  if (a <= 0) return [0, 0, 0, 0];

  const r = bilinear((x, y) => f.rgb[(y * f.w + x) * 3], f.w, f.h, fx, fy);
  const g = bilinear((x, y) => f.rgb[(y * f.w + x) * 3 + 1], f.w, f.h, fx, fy);
  const b = bilinear((x, y) => f.rgb[(y * f.w + x) * 3 + 2], f.w, f.h, fx, fy);
  return [r, g, b, a * 255];
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
        const perPixel = (box.x1 - box.x0) / w;
        const [r, g, b, a] = sampleField(source.field, box, (x + 0.5 - x0) / w, (y + 0.5 - y0) / h, perPixel);
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

/**
 * O logotipo inteiro, centrado numa tela de qualquer proporção. Serve para a
 * abertura, que é quadrada, e para o gráfico de destaque da Google Play, que
 * é 1024x500.
 */
function wordmark({ size, height, background, field: f, box, width }) {
  const W = size;
  const H = height ?? size;
  const canvas = Buffer.alloc(W * H * 4);
  if (background) {
    for (let i = 0; i < W * H; i++) {
      canvas[i * 4] = background[0];
      canvas[i * 4 + 1] = background[1];
      canvas[i * 4 + 2] = background[2];
      canvas[i * 4 + 3] = 255;
    }
  }
  const w = W * width;
  const h = (w * (box.y1 - box.y0)) / (box.x1 - box.x0);
  const x0 = (W - w) / 2, y0 = (H - h) / 2;
  for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const [r, g, b, a] = sampleField(f, box, (x + 0.5 - x0) / w, (y + 0.5 - y0) / h, (box.x1 - box.x0) / w);
      if (a <= 0) continue;
      const i = (y * W + x) * 4;
      const alpha = a / 255;
      for (let k = 0; k < 3; k++) {
        canvas[i + k] = Math.round(canvas[i + k] * (1 - alpha) + [r, g, b][k] * alpha);
      }
      canvas[i + 3] = Math.min(255, Math.round(canvas[i + 3] + a));
    }
  }
  return encodePng(W, H, canvas);
}

// ------------------------------------------------------------------ saída ---
const [brandDir, outDir, storeDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
if (storeDir) mkdirSync(storeDir, { recursive: true });

function marks(file) {
  const img = decodePng(file);
  const groups = glyphs(img);
  // O campo custa dois varrimentos da imagem inteira, então sai uma vez só.
  const f = field(img);
  const first = groups[0];
  const last = groups[groups.length - 1];
  const dB = bounds(img, first[0], first[1]);
  const dotB = bounds(img, last[0], last[1]);
  return {
    img,
    field: f,
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
  size: 1024, background: WHITE, field: positive.field, box: positive.all, width: 0.62,
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

// ------------------------------------------------- fichas das lojas ---------
// Não entram no aplicativo: são os arquivos que a Google Play pede no
// formulário da ficha, em tamanhos que ela recusa se vierem errados.
if (storeDir) {
  // Ícone da ficha: 512x512, o mesmo desenho do ícone do aplicativo.
  writeFileSync(`${storeDir}/play-icon-512.png`, compose({
    size: 512, background: BLUE, source: negative,
    d: negative.d, dot: negative.dot, markHeight: 0.52,
  }));

  // Gráfico de destaque: 1024x500, o logotipo inteiro sobre o azul da marca.
  // Sem texto extra de propósito: a Google corta esta imagem em proporções
  // diferentes conforme a tela, e o que fica fora do centro se perde.
  writeFileSync(`${storeDir}/play-feature-graphic-1024x500.png`, wordmark({
    size: 1024, height: 500, background: BLUE,
    field: negative.field, box: negative.all, width: 0.56,
  }));
}

console.log('ok');
