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
