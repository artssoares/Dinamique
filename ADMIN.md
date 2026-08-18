# Painel administrativo

Next.js 15, App Router, Server Components.

## Duas conexões com poderes diferentes

| Função | Sujeita ao RLS | Para quê |
| --- | --- | --- |
| `getSessionClient()` | sim — age como o admin logado | tudo que o painel lê |
| `getServiceClient()` | **não — ignora o RLS** | as poucas escritas que legitimamente cruzam usuários |

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

1. a política de RLS exclui `is_internal_note = true` para o dono do ticket —
   uma consulta que esquecer de filtrar ainda assim não vaza;
2. a nota não move o status nem atualiza `last_message_at`, porque não é
   atividade que o usuário possa ver;
3. no painel ela aparece em âmbar com borda tracejada e o aviso
   "🔒 NOTA INTERNA — o usuário não vê isto", para ninguém colar uma nota numa
   resposta por engano.

## Catálogos

A lista de tabelas editáveis é **fixa no código**. Sem ela, o nome da tabela
viria do formulário e qualquer tabela do banco ficaria alcançável.

A importação de veículos usa `import_vehicle()`, que valida tipo, combustível e
consumo e devolve erro legível por linha em vez de estourar.

## Deploy na Vercel

| Configuração | Valor |
| --- | --- |
| Root Directory | `apps/admin` |
| Framework | Next.js |
| Build Command | `cd ../.. && pnpm --filter @dinamique/admin build` |
| Install Command | `pnpm install` |
| Output | `.next` (padrão) |

Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` — esta última marcada como sensível e **não**
exposta a deploys de preview de terceiros.
