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

## Onde o painel mora

O painel é servido em **`app.dinamique.com.br/admin`**, o mesmo domínio do
aplicativo, um endereço a menos para lembrar.

São dois projetos diferentes na Vercel, e a Vercel não sabe apontar um caminho
de um domínio para outro projeto. Quem faz a costura é um rewrite declarado em
`apps/mobile/vercel.json`: tudo que chega em `/admin/...` é buscado no projeto
do painel e devolvido pelo domínio do aplicativo.

Para isso o Next precisa gerar todas as suas URLs já com o prefixo, e é o que
`basePath: '/admin'` faz em `apps/admin/next.config.mjs`. Sem ele o navegador
pediria `/_next/...` ao aplicativo, que não tem esses arquivos, e o painel
carregaria sem estilo e sem JavaScript.

Três arquivos precisam concordar sobre o caminho, e `src/lib/base-path.test.ts`
falha no build se algum se afastar dos outros:

| Arquivo | O que declara |
| --- | --- |
| `apps/admin/next.config.mjs` | `basePath` |
| `apps/admin/src/lib/base-path.ts` | a constante `BASE_PATH` |
| `apps/mobile/vercel.json` | o rewrite `/admin/:path*` |

O código continua escrevendo `/login` e `/usuarios`: `redirect()`, `<Link>` e
`useRouter()` acrescentam o prefixo sozinhos.

Uma consequência a lembrar: o webhook do Stripe passa a ser
`https://app.dinamique.com.br/admin/api/billing/webhook`.

### Por que o rewrite aponta para `dinamique-admin-git-main-...`

O destino natural seria `dinamique-admin.vercel.app`, e ele está errado aqui.
A branch de produção do projeto do painel na Vercel ainda é a default antiga do
repositório, então **nenhum deploy vindo da `main` é marcado como produção**:
todos saem como preview, e `dinamique-admin.vercel.app` continua servindo o
build de agosto. Um rewrite para lá entregaria um painel sem `basePath`, ou
seja, sem CSS e sem JavaScript.

`dinamique-admin-git-main-dinamique1.vercel.app` é o alias de branch: ele
aponta sempre para o último deploy da `main`, hoje e também depois que a branch
de produção for corrigida. É o endereço certo nos dois casos.

Quando alguém acertar a branch de produção do projeto (Vercel, projeto
dinamique-admin, Settings, Git, Production Branch, `main`), o alias continua
valendo e não há nada a mudar aqui.

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
