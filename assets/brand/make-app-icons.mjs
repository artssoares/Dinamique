/**
 * Gera os ícones do aplicativo e os arquivos das fichas das lojas a partir dos
 * dois arquivos oficiais da marca. Nada aqui redesenha nada: as formas saem
 * dos arquivos, e o script só separa a marca do fundo, recoloca nas cores
 * exatas do brandbook e reduz para cada tamanho pedido.
 *
 * Por que separar a marca do fundo. Os arquivos oficiais vêm achatados: a
 * letra já está queimada sobre o azul, sem transparência. O ícone adaptativo
 * do Android e o ícone de notificação precisam da marca recortada, com o fundo
 * vazio, então a separação tem de ser calculada.
 *
 * Como. O fundo é medido na borda do próprio arquivo, que é chapado. Para cada
 * pixel, a cor é lida como uma mistura entre esse fundo e uma das duas cores da
 * marca, o branco e o laranja: a fração da mistura vira a cobertura (o alfa) e
 * a cor escolhida vira a cor do pixel. Nas bordas suavizadas da letra a fração
 * cai entre 0 e 1, que é exatamente o antisserrilhado do arquivo original,
 * preservado em vez de recortado a faca.
 *
 * Por que as cores saem do brandbook e não do arquivo. Os dois arquivos foram
 * exportados com compressão e o azul do fundo chega diferente em cada um
 * (#0039FD num, #0137F7 no outro), nenhum deles o azul da marca. O brandbook é
 * quem manda: #0050FF, #FFFFFF e #FF6B4D. Então a forma vem do arquivo e a cor
 * vem da especificação, e o resultado não carrega o ruído da exportação.
 *
 * Por que não há reconstrução por campo de distância aqui. Os arquivos têm
 * 1254x1254 e todos os destinos são menores, então é tudo redução. Reduzir com
 * média de área é exato e não inventa nada; campo de distância só seria
 * necessário para ampliar, que era o caso do logotipo antigo, serrilhado e
 * pequeno demais.
 *
 *   node assets/brand/make-app-icons.mjs assets/brand apps/mobile/assets assets/store
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// As três cores da marca, conforme o brandbook. Não derivar dos arquivos.
const AZUL = [0x00, 0x50, 0xff];
const BRANCO = [0xff, 0xff, 0xff];
const LARANJA = [0xff, 0x6b, 0x4d];

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

/**
 * Escreve o PNG. `alpha: false` grava sem canal de transparência, em tipo de
 * cor 2 (RGB, 24 bits), porque o gráfico de destaque da Google Play é recusado
 * quando chega com alfa; todo o resto sai em tipo 6 (RGBA, 32 bits), que é o
 * que a loja exige do ícone e o que o aplicativo precisa nos recortes.
 */
function encodePng(width, height, rgba, { alpha = true } = {}) {
  const channels = alpha ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = y * (stride + 1) + 1 + x * channels;
      for (let k = 0; k < channels; k++) raw[to + k] = rgba[from + k];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Lê PNG de 8 bits, com ou sem alfa, sem entrelace. Devolve sempre RGBA. */
function decodePng(file) {
  const b = readFileSync(file);
  const width = b.readUInt32BE(16), height = b.readUInt32BE(20);
  const depth = b[24], type = b[25], interlace = b[28];
  if (depth !== 8 || (type !== 2 && type !== 6) || interlace !== 0) {
    throw new Error(`${file}: esperado PNG de 8 bits, RGB ou RGBA, sem entrelace`);
  }
  const src = type === 6 ? 4 : 3;

  const parts = [];
  let off = 8;
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const tag = b.toString('ascii', off + 4, off + 8);
    if (tag === 'IDAT') parts.push(b.subarray(off + 8, off + 8 + len));
    if (tag === 'IEND') break;
    off += 12 + len;
  }

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * src;
  const flat = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= src ? flat[y * stride + x - src] : 0;
      const up = y > 0 ? flat[(y - 1) * stride + x] : 0;
      const ul = x >= src && y > 0 ? flat[(y - 1) * stride + x - src] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (a + up) >> 1;
      else if (filter === 4) {
        const p = a + up - ul;
        const pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - ul);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? up : ul;
      }
      flat[y * stride + x] = value & 0xff;
    }
  }

  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = flat[i * src];
    data[i * 4 + 1] = flat[i * src + 1];
    data[i * 4 + 2] = flat[i * src + 2];
    data[i * 4 + 3] = src === 4 ? flat[i * src + 3] : 255;
  }
  return { width, height, data };
}

// ------------------------------------------------------------- separação ---
/** A cor do fundo, medida na borda do arquivo, que é chapada. */
function corDoFundo(img) {
  const { width: w, height: h, data } = img;
  const faixa = 8;
  let r = 0, g = 0, b = 0, n = 0;
  const soma = (x, y) => {
    const i = (y * w + x) * 4;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  };
  for (let y = 0; y < faixa; y++) for (let x = 0; x < w; x++) { soma(x, y); soma(x, h - 1 - y); }
  for (let x = 0; x < faixa; x++) for (let y = faixa; y < h - faixa; y++) { soma(x, y); soma(w - 1 - x, y); }
  return [r / n, g / n, b / n];
}

/**
 * Separa a marca do fundo. Devolve RGBA já nas cores do brandbook, com o fundo
 * transparente.
 *
 * Cada pixel é lido como `fundo + t * (cor - fundo)`. Para cada cor candidata,
 * `t` é a projeção do pixel sobre a reta que vai do fundo até ela; vale a
 * candidata cujo resíduo for menor, isto é, aquela que explica melhor a cor
 * observada. `t` vira o alfa, então as bordas suavizadas do arquivo original
 * continuam suaves.
 *
 * A zona morta no fim existe porque os arquivos vieram comprimidos: o fundo
 * chapado chega tremendo de um pixel para o outro, e o miolo da letra também.
 * Medido no `icone.png`: 76% dos pixels dão exatamente 0 e outros 16% caem
 * entre 0 e 2%, que é ruído e não marca; no outro extremo, 5% ficam entre 98%
 * e 100%. A borda de verdade, entre 10% e 90%, é só 0,22% da imagem. Então
 * tudo abaixo de 3% vira fundo, tudo acima de 97% vira marca cheia, e a
 * passagem entre os dois é reescalada: o ruído some e a borda suavizada
 * continua inteira.
 */
const ZONA_MORTA = 0.03;

function separar(img, { silhueta = false, noLugarDoBranco } = {}) {
  const { width: w, height: h, data } = img;
  const fundo = corDoFundo(img);
  const candidatas = [BRANCO, LARANJA];
  const out = Buffer.alloc(w * h * 4);

  const eixos = candidatas.map((c) => {
    const d = [c[0] - fundo[0], c[1] - fundo[1], c[2] - fundo[2]];
    return { cor: c, d, len2: d[0] * d[0] + d[1] * d[1] + d[2] * d[2] };
  });

  for (let i = 0; i < w * h; i++) {
    const p = [data[i * 4] - fundo[0], data[i * 4 + 1] - fundo[1], data[i * 4 + 2] - fundo[2]];
    let melhor = null;
    for (const e of eixos) {
      let t = (p[0] * e.d[0] + p[1] * e.d[1] + p[2] * e.d[2]) / e.len2;
      t = Math.min(1, Math.max(0, t));
      const rx = p[0] - t * e.d[0], ry = p[1] - t * e.d[1], rz = p[2] - t * e.d[2];
      const residuo = rx * rx + ry * ry + rz * rz;
      if (!melhor || residuo < melhor.residuo) melhor = { residuo, t, cor: e.cor };
    }
    const t = Math.min(1, Math.max(0, (melhor.t - ZONA_MORTA) / (1 - 2 * ZONA_MORTA)));
    let cor = silhueta ? BRANCO : melhor.cor;
    if (noLugarDoBranco && cor === BRANCO) cor = noLugarDoBranco;
    out[i * 4] = cor[0]; out[i * 4 + 1] = cor[1]; out[i * 4 + 2] = cor[2];
    out[i * 4 + 3] = Math.round(t * 255);
  }
  return { width: w, height: h, data: out };
}

/** A caixa que encosta na marca, para poder reposicioná-la. */
function caixa(img) {
  const { width: w, height: h, data } = img;
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ------------------------------------------------------------- reamostra ---
/**
 * Redução por média de área, com o alfa pré-multiplicado.
 *
 * Pré-multiplicar é o que impede a borda de escurecer: sem isso, um pixel
 * transparente entraria na média com a cor que estiver guardada nele e puxaria
 * o resultado para essa cor. Cada pixel de destino cobre um retângulo exato da
 * origem, e cada pixel de origem entra com a fração da sua área dentro desse
 * retângulo, o que vale também quando a escala não é inteira.
 */
function reamostrar(img, destW, destH, origem) {
  const { width: w, data } = img;
  const box = origem ?? { x0: 0, y0: 0, w: img.width, h: img.height };
  const out = Buffer.alloc(destW * destH * 4);
  const escalaX = box.w / destW, escalaY = box.h / destH;

  for (let dy = 0; dy < destH; dy++) {
    const sy0 = box.y0 + dy * escalaY, sy1 = sy0 + escalaY;
    const iy0 = Math.floor(sy0), iy1 = Math.min(img.height - 1, Math.ceil(sy1) - 1);
    for (let dx = 0; dx < destW; dx++) {
      const sx0 = box.x0 + dx * escalaX, sx1 = sx0 + escalaX;
      const ix0 = Math.floor(sx0), ix1 = Math.min(w - 1, Math.ceil(sx1) - 1);

      let r = 0, g = 0, b = 0, a = 0, peso = 0;
      for (let y = iy0; y <= iy1; y++) {
        const cy = Math.min(y + 1, sy1) - Math.max(y, sy0);
        if (cy <= 0) continue;
        for (let x = ix0; x <= ix1; x++) {
          const cx = Math.min(x + 1, sx1) - Math.max(x, sx0);
          if (cx <= 0) continue;
          const area = cx * cy;
          const i = (y * w + x) * 4;
          const al = data[i + 3] / 255;
          r += data[i] * al * area; g += data[i + 1] * al * area; b += data[i + 2] * al * area;
          a += al * area; peso += area;
        }
      }
      const i = (dy * destW + dx) * 4;
      if (a > 0) {
        out[i] = Math.round(r / a); out[i + 1] = Math.round(g / a); out[i + 2] = Math.round(b / a);
      }
      out[i + 3] = Math.round((a / peso) * 255);
    }
  }
  return { width: destW, height: destH, data: out };
}

/** A arte cortada rente à marca, no tamanho que já tem: 1 para 1, sem reescalar. */
function recortar(arte) {
  const box = caixa(arte);
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    arte.data.copy(
      out,
      y * box.w * 4,
      ((y + box.y0) * arte.width + box.x0) * 4,
      ((y + box.y0) * arte.width + box.x0 + box.w) * 4,
    );
  }
  return { W: box.w, H: box.h, tela: out };
}

// --------------------------------------------------------------- montagem ---
/**
 * Põe a marca numa tela, opcionalmente sobre um fundo chapado.
 *
 * `largura` é a fração da largura da tela que a marca deve ocupar. Quando é
 * nula, a arte entra inteira, do jeito que o arquivo oficial a enquadrou, que é
 * o enquadramento que o designer escolheu.
 */
function montar({ arte, W, H = W, fundo, largura, recorte }) {
  const tela = Buffer.alloc(W * H * 4);
  if (fundo) {
    for (let i = 0; i < W * H; i++) {
      tela[i * 4] = fundo[0]; tela[i * 4 + 1] = fundo[1];
      tela[i * 4 + 2] = fundo[2]; tela[i * 4 + 3] = 255;
    }
  }

  let marca, x0, y0;
  if (largura == null) {
    marca = reamostrar(arte, W, H);
    x0 = 0; y0 = 0;
  } else {
    const box = recorte ?? caixa(arte);
    const destW = Math.round(W * largura);
    const destH = Math.round((destW * box.h) / box.w);
    marca = reamostrar(arte, destW, destH, box);
    x0 = Math.round((W - destW) / 2);
    y0 = Math.round((H - destH) / 2);
  }

  for (let y = 0; y < marca.height; y++) {
    const ty = y + y0;
    if (ty < 0 || ty >= H) continue;
    for (let x = 0; x < marca.width; x++) {
      const tx = x + x0;
      if (tx < 0 || tx >= W) continue;
      const s = (y * marca.width + x) * 4, d = (ty * W + tx) * 4;
      const al = marca.data[s + 3] / 255;
      if (al <= 0) continue;
      for (let k = 0; k < 3; k++) {
        tela[d + k] = Math.round(tela[d + k] * (1 - al) + marca.data[s + k] * al);
      }
      tela[d + 3] = Math.min(255, Math.round(tela[d + 3] + marca.data[s + 3]));
    }
  }
  return { W, H, tela };
}

const png = ({ W, H, tela }, opts) => encodePng(W, H, tela, opts);

// ------------------------------------------------------------------ saída ---
const [brandDir, outDir, storeDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
if (storeDir) mkdirSync(storeDir, { recursive: true });

const icone = separar(decodePng(`${brandDir}/icone.png`));
const logotipo = separar(decodePng(`${brandDir}/logotipo.png`));
const silhueta = separar(decodePng(`${brandDir}/icone.png`), { silhueta: true });

/**
 * Quanto da largura do ícone a marca ocupa.
 *
 * O arquivo oficial enquadra o "d." com 43% da largura, que é folga de avatar
 * de rede social: num ícone de aplicativo, espremido entre outros na tela
 * inicial, a letra fica pequena e some. 60% é o ponto em que a marca se impõe
 * sem encostar no canto arredondado que iOS e Android recortam.
 */
const MARCA = 0.6;

// Ícone do aplicativo.
writeFileSync(`${outDir}/icon.png`, png(montar({ arte: icone, W: 1024, fundo: AZUL, largura: MARCA })));

// Ícone adaptativo do Android: a mesma arte sem fundo, porque o sistema põe o
// azul por baixo (`adaptiveIcon.backgroundColor`) e recorta a tela em formatos
// diferentes conforme o aparelho.
//
// Aqui a marca entra menor de propósito, no enquadramento do próprio arquivo
// oficial, e não nos 60% dos outros. O Android só mostra os ~72% centrais da
// tela: uma marca a 60% da tela inteira apareceria a 83% do que o usuário vê,
// estourando a máscara. A 43% da tela ela ocupa os mesmos ~60% da área visível
// que o ícone estático, que é o que faz os dois parecerem do mesmo tamanho.
writeFileSync(`${outDir}/adaptive-icon.png`, png(montar({ arte: icone, W: 1024 })));

// Tela de abertura: o logotipo inteiro sobre o azul da marca.
writeFileSync(`${outDir}/splash.png`, png(montar({ arte: logotipo, W: 1024, fundo: AZUL })));

// Favicon.
writeFileSync(`${outDir}/favicon.png`, png(montar({ arte: icone, W: 64, fundo: AZUL, largura: MARCA })));

// Ícone de notificação: o Android ignora a cor e usa só o alfa, pintando a
// silhueta por cima da cor que o aplicativo define. Então o ponto laranja
// também entra como branco: aqui ele é recorte, não cor.
writeFileSync(`${outDir}/notification-icon.png`, png(montar({ arte: silhueta, W: 96, largura: 0.72 })));

// ------------------------------------------- logotipo dentro do app ---------
// As duas versões que o `<BrandMark>` escolhe pelo `onDark`, e que a ficha de
// compartilhamento embute em `packages/ui/src/story/wordmark.ts`. Saem da mesma
// arte dos outros arquivos, recortadas rente à marca e sem fundo. A positiva
// troca o branco pelo azul da marca; o ponto continua laranja nas duas, porque
// ele é parte da assinatura.
writeFileSync(`${brandDir}/logo-negativo.png`, png(recortar(logotipo)));
writeFileSync(
  `${brandDir}/logo.png`,
  png(recortar(separar(decodePng(`${brandDir}/logotipo.png`), { noLugarDoBranco: AZUL }))),
);

// ------------------------------------------------- fichas das lojas ---------
// Não entram no aplicativo: são os arquivos que a Google Play pede no
// formulário da ficha, em tamanhos que ela recusa se vierem errados.
if (storeDir) {
  // Ícone da ficha: 512x512, o mesmo desenho do ícone do aplicativo.
  writeFileSync(`${storeDir}/play-icon-512.png`, png(montar({ arte: icone, W: 512, fundo: AZUL, largura: MARCA })));

  // Gráfico de destaque: 1024x500, o logotipo sobre o azul da marca. Sem texto
  // extra de propósito: a Google corta esta imagem em proporções diferentes
  // conforme a tela, e o que fica fora do centro se perde.
  //
  // Sai sem alfa: a Google aceita o destaque só em JPEG ou PNG de 24 bits. A
  // imagem já é opaca de ponta a ponta, então o canal era peso morto que fazia
  // o arquivo ser recusado no envio da ficha.
  writeFileSync(
    `${storeDir}/play-feature-graphic-1024x500.png`,
    png(montar({ arte: logotipo, W: 1024, H: 500, fundo: AZUL, largura: 0.56 }), { alpha: false }),
  );
}

console.log('ok');
