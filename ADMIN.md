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
| `/atividades` | linha do tempo de tudo o que os usuários fizeram, em frases |
| `/erros` | central de erros, agrupados por problema |
| `/erros/[id]` | ficha do erro, palpite em português e prompt pronto para investigar |
| `/testes` | roteiro do aplicativo e rodadas de teste |
| `/administradores` | quem entra no painel, com qual papel |
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

`dinamique.com.br/admin`, servido pelo projeto `dinamique1/dinamique-admin` da
Vercel, que constrói `@dinamique/admin` a partir da raiz do repositório.

O caminho vem do `basePath: '/admin'` no `next.config.mjs`, e não de um
rewrite. A diferença importa: o `basePath` reescreve TODA url que o painel
emite — páginas, `/_next/...`, Server Actions e rotas de api — enquanto um
rewrite mudaria só o endereço da página e deixaria o navegador pedindo os
arquivos à raiz do domínio, que não os tem.

A raiz do domínio não é servida pelo `basePath`, então quem digita
`dinamique.com.br` sem o `/admin` cairia num 404 da Vercel. O `redirects()` do
mesmo arquivo cobre isso, com `basePath: false` — sem essa linha a regra valeria
para `/admin/` e criaria um laço com ela mesma.

### A tentativa anterior, e por que esta é diferente

A de 23/09 apontava um rewrite de `app.dinamique.com.br/admin` para o projeto
`dinamique-admin`, pelo nome. O projeto respondia, aplicava o mesmo rewrite e
devolvia a requisição para si: `508 INFINITE_LOOP_DETECTED`.

Duas coisas mudaram. O painel agora mora no **apex**, `dinamique.com.br`, que
não estava em nenhum projeto — então não há rewrite nenhum entre o aplicativo e
o painel, e nada que possa laçar. E o caminho é o `basePath` do próprio Next,
dentro do projeto que constrói o painel, em vez de um desvio entre dois
projetos.

Há um projeto `dinamique` na conta `feed-on-track`, fora do escopo
`dinamique1`, que também construía o painel e falha desde setembro. Ele não
participa deste caminho e pode ser arquivado: quem publica `/admin` é
`dinamique1/dinamique-admin`.

### O que se move junto

O webhook do Stripe, quando o pagamento entrar no ar, passa a ser
`https://dinamique.com.br/admin/api/billing/webhook` — o `basePath` vale para as
rotas de api também. O endereço em **Developers → Webhooks** precisa acompanhar.

## Saúde do aplicativo

Duas áreas respondem as perguntas que números e fichas não respondem.

### Erros

`app_errors` guarda UM problema por assinatura de falha, não um por ocorrência:
uma tela que quebra para duzentos motoristas é um problema com duzentas
ocorrências, e uma lista de duzentas linhas iguais esconde exatamente isso. A
assinatura tira do texto o que muda a cada vez — ids e números — antes de
agrupar.

O aplicativo **não** tem grant de escrita naquela tabela. Ele chama
`report_app_error()`, `SECURITY DEFINER`, que é a única porta: com grant direto,
qualquer um reabriria, reescreveria ou apagaria o histórico de falhas.

Relatar exige login, e isso tem um custo conhecido: uma falha na tela de login
ou de cadastro não chega ao painel. Abrir a função para `anon` daria escrita no
banco a quem tem a chave pública, que é pública. Perder essa falha é mais
barato.

Um problema marcado como **resolvido** que volta a acontecer reabre sozinho. Um
marcado como **ignorado** não — ignorar é uma decisão sobre o que é aceitável,
resolver é uma afirmação sobre o que foi corrigido.

Do lado de cada erro há o palpite em português do que ele significa e o prompt
de investigação pronto para copiar. Os dois são montados em
`@dinamique/business-logic` (`diagnostics.ts`), não na tela, porque é lá que dá
para testá-los.

### Testes

`qa_suites` → `qa_cases` é o roteiro, editável no painel. Um roteiro fixo no
código envelhece em uma semana e aí ninguém mais olha para ele. `qa_runs` →
`qa_results` é cada passada: a mesma lista, marcada de novo, antes de cada
versão.

Um caso marcado como **essencial** é o que trava a resposta de "dá para
publicar?". Um caso tem um resultado por rodada (`unique (run_id, case_id)`):
sem isso, marcar "passou" e depois "falhou" deixaria as duas linhas e a rodada
não teria resposta.

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
assim: ela responde 401 a toda requisição sem uma sessão da Vercel, e o painel
sumiria por trás de uma tela de login que não é a nossa. Ligá-la de volta
derruba `dinamique.com.br/admin`.

O que guarda o painel é o login dele: o `requireAdmin()` no começo de cada
página e de cada Server Action, e o RLS por baixo. Nenhuma página do painel
mostra qualquer coisa antes de checar o papel em `admin_users`, e a chave de
serviço nunca sai do servidor.
