# Exportações

## O que o usuário recebe

Uma planilha com sete abas, cobrindo o período escolhido:

| Aba | Conteúdo |
| --- | --- |
| Resumo | faturamento, despesas, lucro, tempo, km, R$/hora, R$/km, custo/km, ticket médio |
| Por dia | uma linha por dia, com total |
| Jornadas | início, fim, tempo trabalhado, km |
| Receitas | data, plataforma, valor, gorjeta, corridas |
| Despesas | data, categoria, valor |
| Abastecimentos | data, combustível, valor, preço por litro, litros, odômetro, posto |
| Manutenção | data, tipo, valor, odômetro |

Abas sem nenhuma linha são omitidas — só o Resumo sempre aparece.

## Duas regras que a planilha herda do aplicativo

**Dinheiro sai em reais, não em centavos.** A conversão acontece só na fronteira
da exportação. Ninguém quer abrir uma planilha e ver `28470` onde deveria estar
`284,70`.

**Métrica sem denominador fica em branco, não zero.** Sem quilometragem
registrada, a célula de R$/km fica vazia — igual ao traço que o aplicativo
mostra. Um zero ali seria uma afirmação falsa sobre os dados.

## Formatos

**XLSX** com nome de aba, cabeçalho, formato de moeda (`R$ #,##0.00`), formato
de data, largura de coluna, cabeçalho congelado e linha de total.

**CSV** com separador `;` e vírgula decimal, que é o que o Excel em português
espera. Campos que contêm o separador, aspas ou quebra de linha são escapados.
O CSV vem como pacote único, com cada aba precedida de `# Nome da aba`.

### O que a planilha não tem

Cabeçalho em negrito, cores e bordas. A edição comunitária do SheetJS não
aplica estilo de célula, e trocar por uma biblioteca com estilo significaria
uma dependência bem maior rodando dentro do aplicativo. A planilha é
profissional no que importa para somar e filtrar; o enfeite ficou de fora
conscientemente.

## Onde o arquivo é montado

**No aparelho do usuário.** Os dados são lidos do Supabase e a planilha é
gerada localmente, então nada trafega por servidor nosso além do banco de onde
os dados vieram.

No celular a entrega usa a folha de compartilhamento nativa; na web, um
download comum.

## Registro

Toda exportação grava uma linha em `exports` (quem, qual escopo, qual formato,
quais filtros, quantas linhas). Exportar dados pessoais é um evento de
privacidade e precisa ser auditável (§95, §108).

## Planos

A exportação é um recurso Pro. Um usuário Free continua podendo pedir uma cópia
completa dos próprios dados pelo suporte — isso é direito dele, não um recurso
comercial (§108).

## Exportação no Admin

Ainda não construída. Está prevista na Fase 12 e deve reaproveitar
`@dinamique/exports`: a montagem das planilhas é independente de quem chama.
