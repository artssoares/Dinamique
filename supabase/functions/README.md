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

## `sos-dispatch`

Entrega as notificações de um alerta de emergência: Push da Expo para os
motoristas que `sos_trigger` já escolheu, e SMS para os contatos de emergência
de quem pediu socorro.

```bash
supabase functions deploy sos-dispatch
```

Ela **não decide quem recebe**: isso aconteceu no banco, com o `ST_DWithin`, o
consentimento e os limites. Aqui só se entrega o que já foi decidido.

**Ainda não verificada contra a API real da Expo**, pelo mesmo motivo do
`send-push`. O aviso DENTRO do aplicativo é criado pelo próprio banco junto com
o alerta e funciona sem esta função.

O SMS depende de um provedor contratado, em duas variáveis:

```
SOS_SMS_ENDPOINT   # POST {to, message}
SOS_SMS_TOKEN      # Bearer
```

Sem as duas, a função responde `contacts: { channel: 'manual' }` e a tela do
alerta ativo mostra cada contato com um toque que abre o SMS do próprio celular
já escrito, com a localização. É dito na tela, não escondido num comentário.

## Expiração dos alertas de emergência

`sos_expire_alerts()` encerra os alertas que passaram dos 30 minutos e apaga as
presenças velhas da rede. É ela que cumpre a promessa da tela de consentimento
quando o celular do motorista morreu no meio do alerta, então **ela precisa
estar agendada**, de dois em dois minutos, porque o prazo é de trinta:

```sql
select cron.schedule(
  'sos-expirar-dinamique',
  '*/2 * * * *',
  $$ select sos_expire_alerts() $$
);
```

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
