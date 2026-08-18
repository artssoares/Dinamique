# Notificações

## Dois canais, um deles opcional

**Interna** — aparece no sino dentro do aplicativo. Funciona sempre.
**Push** — chega no celular. É um canal ADICIONAL: o aplicativo continua
inteiro se o usuário recusar a permissão.

A permissão de Push só é pedida quando o usuário liga a opção nas preferências.
Pedir na abertura costuma virar recusa permanente, e aí o canal se perde para
sempre.

## Quem recebe o quê

`send_notification` monta o público e respeita a preferência de cada usuário
por categoria. Isso é verificado **no banco**, não na tela que dispara — assim
uma tela nova não tem como esquecer de checar.

Filtros disponíveis (§100): usuários específicos, cidade, estado, modalidade,
plano, ativos nos últimos N dias, inativos há N dias. Todos opcionais e
somáveis. Contas de demonstração nunca entram.

## Lembretes automáticos

`process_reminders()` transforma lembretes vencidos em notificações:

| Origem | Quando dispara |
| --- | --- |
| Free Flow | na data que o usuário escolheu ao registrar |
| Multas | 3 dias antes de acabar o prazo do desconto |
| Manutenção | 7 dias antes da data prevista |

A função é **idempotente**: rodar duas vezes não duplica notificação. Agende
com `pg_cron` (exemplo em `supabase/functions/README.md`).

## Suporte

Quando a equipe responde um ticket, a notificação é criada na mesma transação
da resposta. O badge do sino e o badge da aba Suporte vêm da mesma view
(`notification_counts`), então não existe contador paralelo para desalinhar.

Abrir a conversa chama `mark_ticket_read()`, que marca as mensagens e as
notificações correspondentes numa transação só.

## O que o usuário pode fazer com uma notificação

Marcar como lida. Só isso.

A permissão de escrita é **na coluna `read_at`**, não na tabela. Um grant de
update na tabela inteira deixaria o usuário reescrever o próprio título e corpo
— inofensivo para os outros, mas é dado nosso e não dele. Coberto por teste.

Criar notificação para si mesmo é impossível: não existe grant de insert.

## Tempo real

O contador de não lidas assina mudanças nas próprias linhas do usuário via
Supabase Realtime, e refaz a consulta em vez de aplicar o payload localmente.
Refazer é um pouco mais lento e bastante mais difícil de errar — aqui
confiabilidade importa mais que instantaneidade (§75).

No Admin, o contador de não respondidos é calculado a cada requisição em um
Server Component. Sem polling, sem badge velho.

## O que ainda não foi verificado

A Edge Function `send-push` está escrita mas a chamada à API da Expo nunca
rodou contra o serviço real — isso exige credenciais de um projeto Expo. A
seleção de destinatários e o respeito às preferências estão cobertos por teste
de banco; a requisição HTTP é o trecho não verificado.
