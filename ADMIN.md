# Painel administrativo

Next.js 15, App Router, Server Components.

## Duas conexões com poderes diferentes

| Função | Sujeita ao RLS | Para quê |
| --- | --- | --- |
| `getSessionClient()` | sim – age como o admin logado | tudo que o painel lê |
| `getServiceClient()` | **não – ignora o RLS** | as poucas escritas que legitimamente cruzam usuários |

Toda Server Action chama `requireAdmin(papéis)` **antes** de tocar na conexão
de serviço. Uma Server Action é um endpoint público: esconder o botão na
barra lateral não é autorização.

Depois da escrita, `logAdminAction()` grava no Audit Log.

`SUPABASE_SERVICE_ROLE_KEY` não tem prefixo `NEXT_PUBLIC_`, então não chega ao
navegador.

## Papéis

| Papel | Alcance |
| --- | --- |
| `superadmin` | tudo, incluindo criar outro superadmin |
| `admin` | operação, usuários, planos, crescimento |
| `support` | apenas suporte |
| `content` | catálogos, tour, regras de insight |
| `analyst` | analytics e relatórios |

Duas travas na promoção a admin, ambas no servidor: **ninguém altera o próprio
acesso** e **só um superadmin cria outro superadmin**.

## Áreas

| Rota | O que faz |
| --- | --- |
| `/` | usuários, atividade, planos, tickets, indicações |
| `/suporte` | caixa de entrada com filtros e ordenação |
| `/suporte/[id]` | conversa, resposta, nota interna, responsável, status |
| `/usuarios` | busca, filtros de atividade, ordenação por último acesso |
| `/usuarios/[id]` | ficha, conceder Pro, bloquear, definir função |
| `/notificacoes` | compositor com segmentação e histórico |
| `/influencers` | candidaturas, aprovar, recusar, suspender, gerar código |
| `/indicacoes` | indicações e descontos concedidos |
| `/codigos` | criar, ativar e desativar códigos de campanha |
| `/analytics` | aquisição, plataformas, veículos, suporte |
| `/relatorios` | cruzamento de dimensões e filtros, com exportação |
| `/catalogos` | plataformas, categorias, tour, insights, importar veículos |
| `/logs` | Audit Log |

## Notas internas no suporte

Uma nota interna nunca chega ao usuário, e três coisas garantem isso:

1. a política de RLS exclui `is_internal_note = true` para o dono do ticket –
   uma consulta que esquecer de filtrar ainda assim não vaza;
2. a nota não move o status nem atualiza `last_message_at`, porque não é
   atividade que o usuário possa ver;
3. no painel ela aparece em âmbar com borda tracejada e o aviso
   "🔒 NOTA INTERNA – o usuário não vê isto", para ninguém colar uma nota numa
   resposta por engano.

## Catálogos

A lista de tabelas editáveis é **fixa no código**. Sem ela, o nome da tabela
viria do formulário e qualquer tabela do banco ficaria alcançável.

A importação de veículos usa `import_vehicle()`, que valida tipo, combustível e
consumo e devolve erro legível por linha em vez de estourar.

## Onde o painel mora, e por que `/admin` ainda não existe

A intenção é servir o painel em `app.dinamique.com.br/admin`, o mesmo domínio
do aplicativo. A tentativa de 23/09 foi desfeita, e o que ela descobriu vale
mais do que o que ela entregou.

### Os três projetos da Vercel, e o que cada um publica de verdade

| Projeto | Publica | Conferido |
| --- | --- | --- |
| `dinamique1/dinamique-mobile` | o aplicativo, em `app.dinamique.com.br` | sim |
| `dinamique1/dinamique-admin` | **o aplicativo também**, apesar do nome | sim, 23/09 |
| `feed-on-track/dinamique` | o painel | é o único que roda `@dinamique/admin` |

O nome `dinamique-admin` mente. Abrir
`dinamique-admin-git-main-dinamique1.vercel.app/` devolve o pacote do Expo, com
a barra de abas e o botão de emergência: é uma segunda cópia do aplicativo, não
o painel. Quem constrói o painel é `feed-on-track/dinamique`, num escopo
diferente da Vercel.

### O laço, e o que ele ensina

O rewrite de `/admin/...` foi apontado para `dinamique-admin`, pelo nome. Como
esse projeto é o próprio aplicativo, ele recebia a requisição, aplicava o mesmo
rewrite e a devolvia para si: `508 INFINITE_LOOP_DETECTED`. O nome de um
projeto não é prova do que ele publica. A prova é abrir a URL.

### O que falta para `/admin` funcionar

1. O deploy do painel voltar a passar. `feed-on-track/dinamique` falha desde
   pelo menos 16/09 (o check `Vercel – dinamique` já estava vermelho no #33,
   antes de qualquer mudança desta leva), então hoje não existe painel no ar
   para onde apontar.
2. Saber o endereço desse projeto, ou ter acesso ao escopo `feed-on-track`.
3. Só então: `basePath: '/admin'` em `next.config.mjs` e o rewrite
   `/admin/:path*` em `apps/mobile/vercel.json`, apontando para o alias de
   branch do painel. Os dois andam juntos, porque sem o `basePath` o navegador
   pede `/_next/...` ao aplicativo, que não tem esses arquivos.

Enquanto isso, `EXPO_PUBLIC_BILLING_URL` fica sem valor de propósito. O
aplicativo já trata a ausência: a tela de plano diz que a assinatura não está
disponível, em vez de falhar contra um endereço morto.

## Deploy na Vercel

| Configuração | Valor |
| --- | --- |
| Root Directory | raiz do repositório |
| Framework | Next.js |
| Build Command | `pnpm --filter @dinamique/admin build` |
| Install Command | `pnpm install --frozen-lockfile` |
| Output | `apps/admin/.next` |

Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` – esta última marcada como sensível e **não**
exposta a deploys de preview de terceiros.

A autenticação da Vercel está desligada neste projeto, e precisa continuar
assim: ela responde 401 a toda requisição sem uma sessão da Vercel, inclusive à
do rewrite, e o painel sumiria por trás de uma tela de login que não é a nossa.
Ligá-la de volta derruba `app.dinamique.com.br/admin`.

O que guarda o painel é o login dele: o `requireAdmin()` no começo de cada
página e de cada Server Action, e o RLS por baixo. Nenhuma página do painel
mostra qualquer coisa antes de checar o papel em `admin_users`, e a chave de
serviço nunca sai do servidor.
