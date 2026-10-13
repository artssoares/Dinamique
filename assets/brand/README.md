# Brand assets

## `icone.png` e `logotipo.png`

Os dois arquivos oficiais da marca, como vieram do brandbook: quadrados de
1254x1254, o `d.` num e o logotipo inteiro no outro, ambos em branco e laranja
sobre o azul. São a origem de tudo nesta pasta e em `apps/mobile/assets/`;
nenhum outro arquivo de imagem é editado à mão.

Eles chegam achatados, sem transparência, e com o azul do fundo diferente em
cada um por causa da compressão da exportação. Por isso o gerador separa a
marca do fundo e repinta nas cores do brandbook, em vez de usar os pixels como
estão. O procedimento está comentado no topo do `make-app-icons.mjs`.

## `logo.png` and `logo-negativo.png`

GERADOS a partir do `logotipo.png` — não editar à mão. Duas versões porque o
manual pede as duas:

- `logo.png`, the blue wordmark with the coral dot, for light surfaces
- `logo-negativo.png`, the white wordmark with the coral dot, for the brand
  blue, headers and dark surfaces

`<BrandMark>` (`apps/mobile/src/features/brand/`) renders one or the other by
its `onDark` prop. The logo is never redrawn, re-typeset in a font, or
reproportioned; the coral dot is part of the signature and is never removed.

The shared story card carries `logo-negativo.png` too, but inlined as a data
URI in `packages/ui/src/story/wordmark.ts` — a generated file, with the command
to refresh it in its own header. That copy exists because the card is exported
to a PNG, and on the web that export serialises the SVG and reloads it as an
image: a bundled asset referenced by URL does not resolve inside the serialised
copy, so the mark would be missing from the file somebody posts. Regenerate it
whenever the brand file changes; nothing checks that the two agree.

## Brand colours

Taken from the brandbook and encoded in `packages/ui/src/tokens/palette.ts`:

| Role | Hex | RGB |
| --- | --- | --- |
| Blue 500 (primary) | `#0050FF` | 0, 80, 255 |
| Coral 500 (accent) | `#FF6B4D` | 255, 107, 77 |
| White | `#FFFFFF` | 255, 255, 255 |

Both are the `500` step of a ten-step ramp; every other step is a tint or shade
of the same hue, never an independently chosen colour.

## Os ícones do aplicativo

`apps/mobile/assets/` guarda o ícone da loja, o ícone adaptativo do Android, a
tela de abertura, o favicon e o ícone de notificação. Nenhum deles é
desenhado: todos saem do `icone.png` e do `logotipo.png` desta pasta.

A marca ocupa 60% da largura nos ícones quadrados. O arquivo oficial a enquadra
com 43%, que é folga de avatar de rede social e deixa a letra pequena demais na
tela inicial de um telefone. A exceção é o ícone adaptativo do Android, que
mantém os 43%: o sistema só mostra os ~72% centrais da imagem, então 43% da
tela inteira dá os mesmos 60% da área que o usuário enxerga.

Para refazer os arquivos depois de trocar a marca:

```bash
node assets/brand/make-app-icons.mjs assets/brand apps/mobile/assets assets/store
```

O terceiro caminho é opcional e guarda o que vai na ficha da Google Play, e
não dentro do aplicativo: o ícone de 512 e o gráfico de destaque de 1024x500.
A Google recusa esses dois arquivos se vierem em outro tamanho, então eles são
gerados em vez de recortados à mão.

O gráfico de destaque não leva texto além do logotipo de propósito: a Google
corta essa imagem em proporções diferentes conforme a tela, e o que fica fora
do centro se perde. Ele também sai sem canal de transparência, em PNG de 24
bits, que é o único formato de PNG que a Google aceita nesse campo.

O mesmo comando regenera o `logo.png` e o `logo-negativo.png` desta pasta.
Depois de trocá-los, o data URI embutido em `packages/ui/src/story/wordmark.ts`
precisa ser refeito pelo comando no cabeçalho daquele arquivo, e o
`LOGO_ASPECT_RATIO` em `apps/mobile/src/features/brand/logo.ts` conferido
contra as dimensões novas. Nada verifica sozinho que os três concordam.
