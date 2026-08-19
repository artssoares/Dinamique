# Por que as chaves do Supabase estão dentro de `vercel.json`

As duas variáveis `EXPO_PUBLIC_*` estão escritas no `build.env` do
`apps/mobile/vercel.json`, e não no painel da Vercel. Vale explicar, porque
"chave versionada" costuma ser sinal de problema — aqui não é.

## O que essas chaves são

`EXPO_PUBLIC_SUPABASE_ANON_KEY` é a chave **anônima**. Ela é pública por
natureza: qualquer variável `EXPO_PUBLIC_*` é embutida no JavaScript que o
navegador baixa, então ela já estaria visível para qualquer pessoa que abrisse
o aplicativo, com ou sem este arquivo. Escondê-la no painel não a tornaria
secreta — apenas mais difícil de encontrar para quem mantém o projeto.

O que protege os dados não é essa chave, é o Row Level Security: toda tabela
tem política, e sem uma sessão válida a chave não lê nada de ninguém.

A chave que **não pode** aparecer aqui é a `service_role`, que ignora o RLS.
Ela nunca sai do servidor, e a varredura de segurança do CI quebra o build se
ela aparecer em qualquer arquivo do aplicativo cliente.

## Por que aqui e não no painel

`EXPO_PUBLIC_*` é resolvida no momento em que o site é construído, não quando
ele roda. Uma variável adicionada no painel depois de um deploy não muda o que
já está publicado — é preciso refazer o deploy. Deixar as duas no arquivo
significa que qualquer deploy, de qualquer branch, sai funcionando, sem
depender de alguém lembrar de configurar o ambiente.

## Como mover para o painel, se preferir

1. No projeto da Vercel, **Settings → Environment Variables**, adicione as duas
   com os mesmos nomes e valores.
2. Remova o bloco `build.env` deste `vercel.json`.
3. Refaça o deploy **sem cache de build** — senão o site publicado continua
   sendo o anterior.

## Se a chave for trocada

Ao rotacionar a chave anônima no painel do Supabase, atualize o valor aqui
também, ou o aplicativo publicado passa a falhar na autenticação.
