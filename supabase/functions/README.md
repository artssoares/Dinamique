# Edge Functions

## `send-push`

Transforma notificações já criadas em `user_notifications` em Push da Expo.

```bash
supabase functions deploy send-push
```

**Ainda não verificada contra a API real da Expo.** Isso exige um projeto Expo
com credenciais, que este repositório não tem. O que está coberto por teste é a
seleção de destinatários e o respeito às preferências do usuário (no banco); a
chamada HTTP é o trecho não verificado.

A notificação interna funciona de ponta a ponta sem esta função – o Push é um
canal adicional, nunca o único.

## Agendamento dos lembretes

`process_reminders()` transforma lembretes vencidos (Free Flow, multas,
manutenção) em notificações. Agende com `pg_cron`:

```sql
select cron.schedule(
  'lembretes-dinamique',
  '0 9 * * *',              -- todo dia às 9h
  $$ select process_reminders() $$
);
```

A função é idempotente: rodar duas vezes não duplica notificação (coberto por
teste).

## Instalação do banco

Para um projeto Supabase novo, use `supabase/setup.sql`: é a concatenação de
todas as migrations, na ordem, num arquivo só. Cole no SQL Editor e execute.

As migrations continuam separadas em `packages/database/migrations` – elas são
o que serve para evoluir o schema. O `setup.sql` é só o pacote de instalação, e
é regenerado com:

```bash
pnpm --filter @dinamique/database run build:setup
```
