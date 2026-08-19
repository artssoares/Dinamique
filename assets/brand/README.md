# Brand assets

## `logo.png` e `logo-negativo.png` — instalados

O logotipo oficial, extraído do mini manual de marca V1.0 (agosto de 2026) e
recortado com fundo transparente:

| Arquivo | Uso |
| --- | --- |
| `logo.png` | wordmark azul com ponto coral — fundos claros, landing, documentos |
| `logo-negativo.png` | wordmark branco com ponto coral — o azul da marca, cabeçalhos, superfícies escuras |

Ambos com 1168 × 213 px. As cores são as do manual, sem arredondamento:
Dinamique Blue `#065DF7` e Coral Point `#FD6561`.

`<BrandMark>` escolhe a versão sozinho: azul no tema claro, branca no escuro, e
`tone="negative"` força a branca quando a marca está sobre o próprio azul.

### Regras do manual que o código respeita

- O ponto final coral faz parte da assinatura e não é removido.
- A proporção vem do arquivo (`LOGO_ASPECT_RATIO`); a marca nunca é esticada.
- O logotipo não é redesenhado nem re-tipografado em fonte.
- Tamanho mínimo em digital: 140 px de largura.

O painel administrativo lê o mesmo arquivo em `apps/admin/public/logo.png`.
