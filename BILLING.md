# Cobrança

Pagamento pelo **Stripe**, em reais, com assinatura recorrente.

## Planos

| Plano | Valor | Equivalente mensal |
| --- | --- | --- |
| Pro anual | R$ 49,90 por ano | R$ 4,16 |
| Pro mensal | R$ 19,90 por mês | R$ 19,90 |

O anual sai por cerca de 2,5 meses do mensal — 79% de desconto. É uma escolha
comercial agressiva e proposital; está registrada aqui para não parecer engano
de digitação para quem ler o código depois.

Os valores vivem na tabela `billing_prices` e são editáveis pelo Admin. Mudar
preço não exige novo build nem aprovação de loja.

## Quem pode escrever estado de cobrança

**Ninguém, no cliente.** O aplicativo só lê. Quem concede e revoga Pro é o
webhook do Stripe, rodando com a service role depois de verificar a assinatura
da requisição.

`billing_prices` e `billing_customers` são somente-leitura para
`authenticated`, e não existe nem grant de escrita — o Admin altera preço pela
service role, então dar permissão a `authenticated` seria superfície sem uso.
Em tabela que decide cobrança, superfície sem uso é risco puro.

## O caminho de uma assinatura

1. O aplicativo chama `POST /api/billing/checkout` com o token do Supabase no
   cabeçalho. **O `user_id` vem do token verificado, nunca do corpo** — aceitar
   um id enviado pelo cliente deixaria qualquer um assinar em nome de outro.
2. O servidor lê o preço **do banco** (aceitar preço do cliente deixaria
   alguém assinar por um centavo), verifica se já existe assinatura ativa,
   aplica o desconto de indicação se houver, e cria a sessão de checkout.
3. O aplicativo abre a URL do Stripe num navegador.
4. O Stripe envia webhooks para `POST /api/billing/webhook`.
5. O aplicativo volta para `/assinatura/sucesso`, que **recarrega o plano** em
   vez de assumir sucesso — voltar do Stripe não é o mesmo que pagamento
   confirmado.

## O webhook

Quatro verificações antes de qualquer escrita, nesta ordem:

1. **Assinatura da requisição.** Sem isso, qualquer um manda um POST e ganha
   Pro de graça. O corpo é lido como texto puro porque a verificação precisa
   dos bytes exatos.
2. **Idempotência.** O Stripe reenvia. `billing_events` tem o id do evento como
   chave primária; um reenvio devolve 200 sem repetir o efeito.
3. **Ordem.** O Stripe não garante ordem de entrega. Um `updated` antigo
   chegando depois de um `deleted` reativaria um cancelamento — eventos mais
   velhos que o último processado são descartados.
4. **Interpretação.** `interpretEvent` é código puro em `@dinamique/billing`,
   testado sem rede, sem chave e sem SDK. É a parte onde um engano concede ou
   revoga plano indevidamente.

O registro em `billing_events` é gravado **depois** do efeito. Se algo falhar
no meio, o Stripe reenvia e nós reprocessamos — melhor repetir uma tentativa do
que marcar como processado algo que não chegou a acontecer.

## Estados

| Estado no Stripe | Nosso estado | Pro vale? |
| --- | --- | --- |
| `active` | `active` | sim |
| `trialing` | `trialing` | sim |
| `past_due` | `past_due` | **sim** |
| `unpaid` | `unpaid` | não |
| `canceled`, `incomplete_expired`, `paused` | `canceled` | não |
| desconhecido | `incomplete` | não |

`past_due` mantém o acesso de propósito: a cobrança falhou mas o Stripe ainda
vai tentar de novo, e cortar o acesso de um motorista porque o cartão recusou
na primeira tentativa é hostil. Quem decide o corte é `unpaid`, que só chega
depois de todas as tentativas.

Um estado que o Stripe inventar no futuro cai em `incomplete` — nunca em
"ativo". O padrão seguro é não conceder.

## Desconto de indicação

O benefício de R$ 10 (§83) vira um cupom do Stripe com `duration: 'once'` —
sem isso ele se repetiria em toda renovação.

`consume_discount_benefit` é atômico: a condição `status = 'granted'` é a
trava, então uma renovação anual não consome o desconto de novo. Coberto por
teste.

Quando a assinatura passa a valer, a indicação correspondente é marcada como
convertida, alimentando o relatório de conversão por origem.

## Cancelamento

Pelo **portal do cliente do Stripe**, não por um botão nosso. Um cancelamento
caseiro dependeria de nós lembrarmos de avisar o Stripe; assim é o contrário —
o Stripe cancela e nos avisa por webhook.

Cancelamento agendado (`cancel_at_period_end`) mantém o acesso até o fim do
período já pago.

**Cancelar a assinatura paga não remove um trial que ainda esteja valendo.**
Quem assina e desiste dentro dos 7 dias iniciais não perde os dias que
sobraram. Coberto por teste.

## Preços no Stripe

Preço no Stripe é imutável. Mudar valor cria um preço novo e aposenta o
anterior — **quem já assina continua no preço que contratou**, que é o
comportamento correto e o motivo de cada assinatura guardar seu
`stripe_price_id`.

Enquanto um preço não estiver publicado no Stripe, o aplicativo mostra
"pagamento em configuração" e manda para o suporte, em vez de abrir um checkout
que falharia.

## Variáveis de ambiente

| Variável | Onde | Observação |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | servidor | cobra dinheiro de verdade; sem `NEXT_PUBLIC_` |
| `STRIPE_WEBHOOK_SECRET` | servidor | é o que prova que a requisição veio do Stripe |
| `NEXT_PUBLIC_APP_URL` | servidor | para onde o usuário volta |
| `EXPO_PUBLIC_BILLING_URL` | aplicativo | onde ficam os endpoints; nenhuma chave |

Nenhuma chave do Stripe existe dentro do aparelho.

## Como colocar no ar

1. crie a conta no Stripe e pegue a chave secreta
2. preencha as variáveis no deploy do painel
3. no Admin, em **Assinaturas**, clique em *Publicar preços no Stripe*
4. no Stripe, cadastre o webhook apontando para
   `https://SEU-DOMINIO/api/billing/webhook`, assinando os eventos
   `customer.subscription.*`, `checkout.session.completed`, `invoice.paid` e
   `invoice.payment_failed`
5. copie o segredo do webhook para `STRIPE_WEBHOOK_SECRET`
6. teste com `stripe listen --forward-to localhost:3000/api/billing/webhook`

## O que ainda não foi verificado

As chamadas ao Stripe nunca rodaram contra a API real — isso exige uma conta
com chaves. O que **está** coberto por teste: as 32 regras de interpretação de
evento, decisão de checkout e desconto (sem rede), e as 18 asserções de banco
sobre concessão, revogação, idempotência e permissões.

O que falta verificar em ambiente real é a camada de transporte: assinatura do
webhook, criação de sessão e portal. O caminho para isso é o `stripe listen`
do passo 6.
