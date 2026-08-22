# Colocar o Dinamique no ar

Três etapas. A primeira leva cinco minutos e destrava tudo.

---

## 1. Banco de dados (Supabase)

1. Em [supabase.com](https://supabase.com), crie um projeto.
   Região: **South America (São Paulo)** – é a mais perto dos usuários.
2. Abra **SQL Editor** → **New query**.
3. Cole o conteúdo de [`supabase/setup.sql`](./supabase/setup.sql) e execute.

Isso cria 45 tabelas, 108 políticas de segurança, as funções e os dados
iniciais (plataformas, categorias, catálogo de veículos, preços dos planos).

4. Em **Settings → API**, copie:
   - **Project URL** → `https://xxxxx.supabase.co`
   - **anon public** → chave que começa com `eyJ...`
   - **service_role** → outra chave `eyJ...` (esta é secreta)

> A chave **anon** é pública por natureza: ela não dá acesso a nada sozinha,
> porque todas as tabelas estão atrás de Row Level Security. A **service_role**
> ignora o RLS – ela só entra no servidor, nunca no aplicativo.

### Dados de demonstração (opcional)

Para ver o app cheio antes de ter usuários reais, execute também
[`packages/database/seed/001_demo.sql`](./packages/database/seed/001_demo.sql).
Cria o Arthur com 30 dias de histórico e 60 motoristas para os relatórios e o
benchmark funcionarem.

Para remover depois: `select demo_teardown();`

---

## 2. Aplicativo (Vercel)

No projeto **dinamique-app**, em **Settings → Environment Variables**:

| Variável | Valor |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | a Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | a chave anon |
| `EXPO_PUBLIC_BILLING_URL` | a URL do painel (etapa 3) |
| `EXPO_PUBLIC_ARCGIS_API_KEY` | a chave do mapa (etapa 6) — pode ficar vazia |

Depois, **Deployments → Redeploy**. Sem essas variáveis o aplicativo mostra a
tela de instalação em vez de quebrar.

---

## 3. Painel administrativo (Vercel)

No projeto **dinamiqueoficial**, as mesmas chaves com outro prefixo:

| Variável | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | a Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a chave anon |
| `SUPABASE_SERVICE_ROLE_KEY` | a chave service_role – marque como **Sensitive** |
| `NEXT_PUBLIC_APP_URL` | a URL do aplicativo (etapa 2) |

### Virar administrador

O painel exige um administrador, e o primeiro precisa ser criado à mão.
Crie sua conta pelo aplicativo e depois, no SQL Editor:

```sql
insert into admin_users (user_id, role)
select id, 'superadmin' from profiles where email = 'seu@email.com';
```

---

## 4. Pagamento (Stripe) – quando quiser cobrar

1. Crie a conta no [Stripe](https://stripe.com) e pegue a chave secreta.
2. No projeto do painel, adicione:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET` (sai do passo 4)
3. No painel, em **Assinaturas**, clique em *Publicar preços no Stripe*.
4. No Stripe, em **Developers → Webhooks**, adicione o endpoint
   `https://SEU-PAINEL/api/billing/webhook` com os eventos
   `customer.subscription.*`, `checkout.session.completed`, `invoice.paid` e
   `invoice.payment_failed`. Copie o segredo gerado.

Detalhes em [`BILLING.md`](./BILLING.md).

---

## 5. Logo

O arquivo ainda não está no repositório. Salve o PNG com fundo transparente em
`assets/brand/logo.png` e siga as duas linhas descritas em
[`assets/brand/README.md`](./assets/brand/README.md).

Até lá o aplicativo mostra um espaço tracejado no lugar da marca – de
propósito, para a ausência ficar visível em vez de o nome ser recriado com
outra fonte.

---

## 6. Mapa do trajeto (Esri) — opcional

O replay do trajeto desenha o caminho do motorista sobre um mapa de rua da
Esri. **Sem a chave o aplicativo não quebra:** o replay mostra o mesmo traço
desenhado, com o degradê da marca, e nada mais muda.

1. Crie uma conta gratuita no
   [ArcGIS Location Platform](https://location.arcgis.com/).
2. Em **API keys**, crie uma chave nova.
3. Em **Privileges**, deixe marcado apenas **Basemaps**. Isso importa: a chave
   vai embutida no aplicativo, como toda variável `EXPO_PUBLIC_`, e uma chave
   restrita a mapas não serve para mais nada se alguém copiá-la.
4. Cole o valor em `EXPO_PUBLIC_ARCGIS_API_KEY`, na Vercel e no seu `.env`.

O plano gratuito cobre milhões de carregamentos de mapa por mês — bem acima do
que um aplicativo em crescimento consome, já que o mapa só aparece quando
alguém abre um trajeto.

---

## 7. Aplicativo nativo (iOS e Android)

Até aqui tudo roda na web. A contagem por GPS em segundo plano e o mapa do
replay **só funcionam num build nativo** — não funcionam no Expo Go, porque
dependem de config plugins que só existem depois do `prebuild`.

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform android   # o mais rápido, e sem conta paga
```

Os perfis estão em [`apps/mobile/eas.json`](./apps/mobile/eas.json):
`development` para testar no seu aparelho, `preview` para mandar para outra
pessoa, `production` para as lojas.

Duas coisas para saber antes do primeiro build:

- **Os ícones do aplicativo ainda não estão no repositório.** O `app.json`
  aponta para `assets/icon.png`, `splash.png`, `adaptive-icon.png` e
  `favicon.png`. O `expo export --platform web` tolera a ausência; o
  `prebuild` não. Gere-os a partir do logo antes de buildar.
- **A App Store revisa localização em segundo plano com cuidado.** O texto que
  aparece no diálogo do iPhone está em `app.json` e explica exatamente para que
  serve. Mande, nas notas da revisão, uma conta de teste e uma gravação de tela
  mostrando a jornada em andamento — pedir "Sempre" sem isso costuma voltar
  reprovado.

---

## Arquivos para colar no SQL Editor da Supabase

Estes dois arquivos existem para serem copiados inteiros e colados no SQL
Editor do projeto na Supabase. Os dois podem ser rodados quantas vezes quiser,
sem estragar nada.

| Arquivo | Para quê | Quando rodar |
| --- | --- | --- |
| [`supabase/setup.sql`](./supabase/setup.sql) | Cria o banco inteiro: tabelas, permissões, funções e dados de referência. | Uma vez, no começo. |
| [`supabase/correcao-seguranca.sql`](./supabase/correcao-seguranca.sql) | Fecha as permissões que a Supabase e o Postgres deixam abertas por padrão. Já está dentro do `setup.sql`; existe separado para quem criou o banco antes desta correção. | Se você rodou o `setup.sql` antes de 18/08. |
| [`supabase/correcao-cadastro.sql`](./supabase/correcao-cadastro.sql) | Faz o cadastro funcionar quando as extensões do Postgres estão no schema `extensions`, como na Supabase. Já está dentro do `setup.sql`. | Se você rodou o `setup.sql` antes de 18/08. |
| [`supabase/testar-cadastro.sql`](./supabase/testar-cadastro.sql) | Diz se o cadastro está funcionando, sem criar nada. | Quando o cadastro falhar. |
| [`supabase/virar-admin.sql`](./supabase/virar-admin.sql) | Transforma a sua conta em administrador do painel. | Depois de criar sua conta no aplicativo. |

O `virar-admin.sql` procura pelo e-mail do cadastro – troque o e-mail dentro do
arquivo se você usou outro.

---

## Rodando na sua máquina

```bash
pnpm install

cp apps/mobile/.env.example apps/mobile/.env      # preencha as duas chaves
cp apps/admin/.env.example apps/admin/.env.local  # preencha as três

pnpm mobile   # aplicativo (iOS, Android e web)
pnpm admin    # painel em http://localhost:3000
```

Para publicar nas lojas, o caminho é o EAS Build da Expo – o projeto já está
configurado para isso (`apps/mobile/app.json`), mas o envio para App Store e
Google Play exige as contas de desenvolvedor.
