# Publicar o Dinamique na App Store e na Google Play

Escrito para quem nunca publicou um aplicativo. Cada passo diz onde clicar, o
que vai custar e quanto tempo costuma levar. Nada aqui exige saber programar, e
**nada aqui exige um Mac**: quem compila o aplicativo é a Expo, na nuvem dela.

Leia a seção "O caminho inteiro em uma página" e depois siga as etapas na
ordem. Elas foram ordenadas pelo tempo de espera: o que demora para liberar
vem primeiro.

---

## O caminho inteiro em uma página

| # | Etapa | Custo | Espera |
| --- | --- | --- | --- |
| 1 | Criar a conta na Google Play | US$ 25, uma vez | 1 a 3 dias para verificar a identidade |
| 2 | Criar a conta na Apple | US$ 99 por ano | 1 a 2 dias (até 2 semanas se for empresa) |
| 3 | Criar a conta na Expo e conectar o projeto | grátis | minutos |
| 4 | Gerar os arquivos do aplicativo | grátis | 15 a 40 min por plataforma |
| 5 | Instalar no seu celular e testar | – | 1 dia |
| 6 | Montar as fichas das lojas e o vídeo da localização | – | 3 a 5 horas |
| 7 | Enviar para revisão | – | Apple: 1 a 2 dias · Google: 1 a 7 dias |

**Total realista: de duas a três semanas até estar nas duas lojas**, e quase
toda essa espera é verificação de conta e teste fechado, não trabalho seu.

Há uma armadilha de calendário que pega todo mundo: uma conta **pessoal** nova
na Google Play só pode publicar depois de rodar um **teste fechado com 12
pessoas por 14 dias seguidos**. Conta de **empresa** (com CNPJ) não passa por
isso. Se você tem CNPJ, abra a conta como empresa: economiza duas semanas.

---

## Antes de começar: o que já está pronto e o que falta você decidir

Já está no repositório, feito nesta leva:

- ícone, tela de abertura e ícone de notificação (`apps/mobile/assets/`),
  recortados do logotipo oficial pelo `assets/brand/make-app-icons.mjs`;
- `apps/mobile/eas.json`, com os três perfis de compilação e as chaves públicas
  do Supabase embutidas. Sem isso o aplicativo instalado abriria na tela
  "falta conectar o banco";
- **exclusão da conta dentro do aplicativo** (Mais → Conta e privacidade). A
  Apple recusa, pela diretriz 5.1.1(v), qualquer aplicativo que crie conta e
  não deixe apagá-la ali dentro. Era o bloqueio mais caro e já está resolvido;
- **Política de Privacidade, Termos de Uso, página de suporte e página de
  exclusão de conta**, todas abertas sem login: as quatro URLs que as lojas
  pedem nos formulários.

Falta você decidir três coisas:

1. **Um e-mail de contato.** A Google Play mostra esse endereço na ficha
   pública do aplicativo, então use um endereço do domínio
   (`suporte@dinamique.com.br`) e não o seu pessoal. Depois de criá-lo,
   preencha-o em `apps/mobile/src/features/legal/entity.ts`, no campo `email`.
2. **Pessoa física ou empresa.** Vale para as duas lojas. Com CNPJ, o nome do
   vendedor é o da empresa e a Google Play dispensa o teste de 14 dias. Sem
   CNPJ, o nome que aparece na loja é o seu nome completo, e ele fica público.
3. **iPad, sim ou não.** Hoje `apps/mobile/app.json` diz
   `"supportsTablet": true`, e a Apple vai cobrar capturas de tela de iPad e
   testar o aplicativo em iPad. Trocar para `false` tira essa exigência e é o
   caminho mais simples para a primeira versão.

Se quiser preencher a razão social e o CNPJ nos documentos legais, os campos
`legalName` e `taxId` estão no mesmo arquivo `entity.ts`. Enquanto estiverem
vazios, o texto simplesmente não os menciona.

---

## Etapa 1. Conta na Google Play (comece por aqui)

1. Abra **<https://play.google.com/console/signup>** e entre com uma conta
   Google. Use uma conta que você não vá perder: ela é dona do aplicativo.
2. Escolha **Organização** se tiver CNPJ, ou **Pessoal** se não tiver.
3. Pague a taxa única de **US$ 25**.
4. O Google pede documento de identidade e, para empresa, o número D-U-N-S
   (grátis, em <https://developer.google.com/partners/dandb>). A verificação
   leva de 1 a 3 dias. Siga para a etapa 2 enquanto espera.
5. Assim que a conta estiver aprovada, em **Todos os apps → Criar app**:
   - Nome: `Dinamique`
   - Idioma padrão: Português (Brasil)
   - App ou jogo: **App**
   - Gratuito ou pago: **Gratuito** (a assinatura Pro é compra dentro do app)

> Guarde o nome do pacote: **`com.dinamique.app`**. Ele é definitivo: depois
> de publicado não muda nunca mais.

---

## Etapa 2. Conta na Apple

1. Abra **<https://developer.apple.com/programs/enroll/>** e entre com um Apple
   ID. Ative a verificação em duas etapas antes, ou o cadastro trava.
2. Escolha Indivíduo ou Empresa. Empresa exige D-U-N-S e demora mais.
3. Pague **US$ 99 por ano**. A liberação costuma sair em 24 a 48 horas.
4. Com a conta liberada, abra **<https://appstoreconnect.apple.com>**, que é onde
   o aplicativo vai morar. Não crie o registro do aplicativo à mão: a
   ferramenta da etapa 4 cria sozinha, com os identificadores certos.

> O identificador na Apple é o mesmo **`com.dinamique.app`**, e também é
> definitivo.

---

## Etapa 3. Conta na Expo e conexão com o projeto

A Expo é quem compila o aplicativo nos servidores dela e entrega os arquivos
prontos para as lojas. O plano gratuito serve; as compilações só entram numa
fila que pode demorar mais.

1. Crie a conta em **<https://expo.dev/signup>**.
2. No seu computador, com o repositório baixado:

```bash
npm install -g eas-cli
cd apps/mobile

eas login       # o usuário e a senha da expo.dev
eas init        # cria o projeto na Expo e grava o id no app.json
```

3. O `eas init` altera `apps/mobile/app.json`, acrescentando `owner` e
   `extra.eas.projectId`. **Guarde essa alteração no Git**: o envio de
   notificações depende desse id:

```bash
git add apps/mobile/app.json
git commit -m "Conecta o aplicativo ao projeto da Expo"
```

---

## Etapa 4. Gerar os arquivos do aplicativo

Sempre de dentro de `apps/mobile`.

```bash
# Android: gera o .aab que a Google Play aceita
eas build --platform android --profile production

# iOS: gera o .ipa que a App Store aceita
eas build --platform ios --profile production
```

Na primeira vez a ferramenta faz perguntas sobre assinatura digital. **Aceite
tudo o que ela se oferecer para criar** ("Generate a new keystore", "Generate a
new Apple Distribution Certificate"): a Expo guarda essas chaves e você nunca
mais precisa pensar nelas. No iOS ela vai pedir o seu Apple ID e a senha.

Cada compilação leva de 15 a 40 minutos e o link do resultado aparece no
terminal e em <https://expo.dev>.

> **Perder a keystore do Android significa não poder mais atualizar o
> aplicativo publicado.** Como a Expo guarda a sua, faça um backup mesmo assim:
> `eas credentials` → Android → *Download keystore*, e guarde o arquivo num
> lugar seguro. Ele está no `.gitignore` de propósito: nunca no Git.

---

## Etapa 5. Testar antes de qualquer loja ver

Esta etapa não é opcional: é onde você descobre que faltou preencher uma
variável, três horas antes de a Apple descobrir.

**Android, no seu celular, em 10 minutos:**

```bash
eas build --platform android --profile preview
```

Isso gera um `.apk`. Abra o link no celular Android, instale e use o aplicativo
de verdade: crie uma conta, registre uma jornada, abra o suporte, entre em
Mais → Conta e privacidade.

**iOS, pelo TestFlight:**

```bash
eas submit --platform ios --latest
```

O arquivo vai para o App Store Connect. Em **TestFlight**, adicione o seu
e-mail como testador interno, instale o aplicativo TestFlight no iPhone e
teste. Convidar testadores internos não passa por revisão da Apple.

**Google Play, o teste fechado obrigatório (só para conta pessoal):**

No Play Console, em **Testes → Teste fechado**, crie uma faixa, suba o `.aab` e
convide **12 pessoas** por e-mail. Elas precisam ficar com o aplicativo
instalado por **14 dias seguidos**. Comece isso assim que a conta for aprovada:
é o item mais demorado do calendário inteiro.

---

## Etapa 6. Montar as fichas das lojas

### As quatro URLs que as duas lojas pedem

| Campo | Endereço |
| --- | --- |
| Política de Privacidade | `https://app.dinamique.com.br/legal/privacidade` |
| Termos de Uso | `https://app.dinamique.com.br/legal/termos` |
| Suporte | `https://app.dinamique.com.br/legal/suporte` |
| Exclusão de conta (Google) | `https://app.dinamique.com.br/legal/excluir-conta` |

As quatro abrem sem login. Confira as quatro no navegador antes de colar nos
formulários. Um link quebrado é motivo de recusa automática.

### Textos (servem para as duas lojas)

**Nome:** Dinamique

**Subtítulo / descrição curta** (até 30 caracteres na Apple, 80 na Google):

> Quanto você realmente ganhou

**Descrição longa**, para usar como ponto de partida:

> O Dinamique responde a pergunta que os aplicativos de corrida não respondem:
> não quanto você recebeu, mas quanto você realmente ganhou.
>
> Registre as suas corridas, entregas e gorjetas, os abastecimentos, as
> despesas e a quilometragem. O Dinamique desconta o combustível, a manutenção,
> os custos fixos, as multas e o pedágio, e mostra o que sobrou de verdade.
>
> • Lucro do dia, da semana e do mês, já com os custos descontados
> • Quanto você ganha por hora e por quilômetro rodado
> • Custo real do seu veículo, a partir do consumo dele
> • Metas de ganho e projeção de quanto falta
> • Comparação com a mediana de outros motoristas, sempre em grupo
> • Histórico completo e exportação em planilha
> • Custos fixos, manutenção, multas e Free Flow em um lugar só
>
> Feito para motorista de aplicativo, taxista, entregador e motoboy.
>
> O Dinamique não tem vínculo com Uber, 99, iFood ou Rappi, e não acessa as
> suas contas nessas plataformas.

**Palavras-chave (Apple, 100 caracteres):**

> motorista,uber,99,ifood,entregador,lucro,ganhos,combustível,km,taxi

**Categoria:** Finanças (nas duas lojas). Classificação: livre / 4+.

### Imagens

| Imagem | Onde | Tamanho |
| --- | --- | --- |
| Ícone | Google Play | 512 × 512 PNG |
| Gráfico de destaque | Google Play | 1024 × 500 |
| Capturas de celular | Google Play | mínimo 2, até 8 |
| Capturas de iPhone | App Store | 1290 × 2796 ou 1320 × 2868, de 3 a 10 |
| Capturas de iPad | App Store | só se `supportsTablet` continuar `true` |

O ícone de 512 é o mesmo `apps/mobile/assets/icon.png` reduzido.

Para as capturas sem precisar de um iPhone: abra
`https://app.dinamique.com.br` no Chrome, tecle `F12`, ative o modo de
dispositivo, escolha *Dimensions: Responsive*, digite **1290 × 2796** com zoom
em 100%, e capture com o menu de três pontinhos → *Capture screenshot*. As
lojas só conferem o tamanho em pixels do arquivo.

Capture as telas nesta ordem, lembrando que a primeira é a única que a maioria
vê: Início (o lucro do dia), Insights (R$/hora e R$/km), Registrar uma jornada,
Histórico, Metas.

> Antes de capturar, entre com uma conta de demonstração cheia. O
> `packages/database/seed/001_demo.sql` cria 30 dias de histórico exatamente
> para isso. Uma captura de tela vazia derruba a conversão da ficha.

### Formulários de privacidade

**Google Play → Política do app → Segurança dos dados.** Declare que o
aplicativo coleta e transmite: nome, e-mail, telefone (opcional), fotos
(opcional), dados financeiros do usuário e atividade no app. Marque que os
dados são criptografados em trânsito e que o usuário pode pedir a exclusão,
apontando para a URL de exclusão de conta acima.

**App Store Connect → Privacidade do app.** Declare os mesmos itens, todos
vinculados à identidade do usuário e nenhum usado para rastreamento
publicitário. Não usamos rede de anúncios nem identificador de publicidade, o
que dispensa a permissão de rastreamento (ATT).

### Perguntas que a Apple faz no envio

- **Contas de demonstração:** obrigatório. Crie uma conta real no aplicativo e
  informe o e-mail e a senha dela no campo "Sign-in required". Sem isso o
  revisor não entra e recusa em poucas horas.
- **Criptografia:** o `app.json` já responde não (`usesNonExemptEncryption:
  false`), porque o aplicativo só usa HTTPS padrão.
- **Notas para a revisão:** escreva algo como *"Aplicativo de controle
  financeiro para motoristas. Todos os dados são digitados pelo usuário. Não há
  integração com Uber, 99 ou iFood. A exclusão da conta fica em Mais → Conta e
  privacidade."*

### Se a assinatura Pro for cobrada dentro do aplicativo

Hoje a cobrança é feita pelo Stripe, pelo navegador. **As duas lojas exigem que
conteúdo digital consumido dentro do aplicativo seja vendido pelo sistema de
pagamento delas**, com a comissão de 15% a 30%. Um botão que leva para pagar
fora costuma ser recusado.

Para a primeira versão, o caminho simples é publicar **sem** o botão de
assinatura nos aplicativos das lojas e deixar a assinatura só na web. Trocar o
Stripe por compra dentro do aplicativo é um trabalho à parte (RevenueCat ou
`expo-in-app-purchases`, mais preços espelhados nas duas lojas) e não vale a
pena atrasar o lançamento por causa dele.

---

## O item que mais derruba aplicativos como este: localização em segundo plano

O Dinamique mede os quilômetros da jornada pelo GPS e continua medindo com a
tela apagada. Isso é `ACCESS_BACKGROUND_LOCATION` no Android e
`UIBackgroundModes: location` no iOS, e as duas lojas tratam essa permissão
como o pedido mais sensível que existe. É o que tem mais chance de custar uma
recusa, mais do que qualquer outro item deste guia.

Prepare a defesa antes de enviar, não depois da recusa. Ela é sempre a mesma
frase, dita em três lugares:

> O motorista inicia uma jornada e guarda o celular no suporte. O aplicativo
> conta os quilômetros rodados durante essa jornada para calcular o custo por
> quilômetro e o lucro real. Sem a leitura em segundo plano, a contagem para
> quando a tela apaga e o motorista precisa anotar o odômetro à mão. A
> localização só é lida com uma jornada aberta, nunca fora dela, e nunca é
> compartilhada com terceiros.

**Google Play.** Em **Política do app → Acesso à localização em segundo
plano**, existe um formulário obrigatório. Ele pede a justificativa acima e
**um vídeo** mostrando o recurso funcionando: comece o vídeo na tela onde o
motorista abre a jornada, mostre o pedido de permissão e mostre a contagem de
quilômetros subindo. Suba o vídeo no YouTube como "não listado" e cole o link.
Sem esse formulário o aplicativo não sai da revisão.

**App Store.** A justificativa vai em "Notas para a revisão", e o texto da
permissão que aparece na tela do usuário já está no `app.json`. Confira que a
permissão só é pedida **quando o motorista abre a primeira jornada**, e nunca
na abertura do aplicativo: pedir localização de entrada, antes de a pessoa
entender para quê, é motivo de recusa por si só.

**Nos dois formulários de privacidade**, declare que a localização é coletada,
vinculada à identidade do usuário, usada para "Funcionalidade do app", e **não**
usada para rastreamento nem publicidade.

---

## Etapa 7. Enviar para revisão

**Android.** A Google Play não aceita o primeiro envio pela linha de comando:
o aplicativo precisa existir no console com pelo menos uma versão enviada à
mão. Então, da primeira vez, baixe o `.aab` da página da compilação na
expo.dev e suba em **Produção → Criar nova versão**. Preencha as notas da
versão e envie para revisão.

Depois da primeira vez, as seguintes saem por aqui:

```bash
eas submit --platform android --latest
```

Para isso funcionar, crie uma conta de serviço em **Play Console →
Configuração → Acesso à API**, baixe o JSON e salve na raiz do repositório como
`google-play-key.json`. O caminho já está no `eas.json` e o arquivo já está no
`.gitignore`. Esse arquivo dá poder de publicar em seu nome: nunca no Git,
nunca por e-mail.

**iOS.**

```bash
eas submit --platform ios --latest
```

Depois, no App Store Connect, abra a versão, confirme que as capturas e os
textos estão lá e clique em **Adicionar para revisão**.

**Prazos e recusas.** A Apple responde em 24 a 48 horas; a Google leva de 1 a 7
dias na primeira vez. Recusa é rotina, não fracasso: a mensagem diz o número da
diretriz, você corrige e reenvia pelo mesmo lugar, sem custo. As três recusas
mais comuns são conta de demonstração que não funciona, link de privacidade
quebrado e falta de exclusão de conta. As três já estão cobertas aqui.

---

## Etapa 8. Publicar uma atualização depois

A versão que aparece para o usuário é a `version` do `apps/mobile/app.json`.
Suba-a (`1.0.0` → `1.0.1`) e rode de novo:

```bash
cd apps/mobile
eas build --platform all --profile production
eas submit --platform all --latest
```

O número interno de cada compilação sobe sozinho: é o que
`"appVersionSource": "remote"` com `autoIncrement` faz no `eas.json`.

Correção de texto ou de tela, sem mexer em código nativo, pode ir pelo ar sem
passar pela loja, com o EAS Update. Vale configurar depois que a primeira
versão estiver publicada, não antes.

---

## Notificações no celular (opcional, depois)

O aplicativo funciona inteiro sem isso: a notificação interna já existe. Para
o aviso aparecer com o aplicativo fechado:

- **iOS:** a Expo cria a chave de push sozinha durante a compilação. Nada a
  fazer.
- **Android:** é preciso ligar o Firebase. Crie um projeto em
  <https://console.firebase.google.com>, adicione um app Android com o pacote
  `com.dinamique.app`, baixe a chave de conta de serviço e envie com
  `eas credentials` → Android → *Google Service Account*. Sem isso a
  notificação simplesmente não chega, e nada mais quebra.

---

## Checklist final antes do envio

- [ ] E-mail de contato criado e preenchido em `entity.ts`
- [ ] As quatro URLs legais abrindo no navegador, sem login
- [ ] Conta de demonstração criada, testada e informada à Apple
- [ ] Capturas de tela com dados de verdade, não com telas vazias
- [ ] Aplicativo instalado no seu celular e usado do cadastro à exclusão
- [ ] Exclusão de conta testada de ponta a ponta (Mais → Conta e privacidade)
- [ ] Vídeo da localização em segundo plano gravado e no YouTube, não listado
- [ ] Decidido: iPad sim ou não
- [ ] Decidido: assinatura fica fora do aplicativo nesta primeira versão
- [ ] Backup da keystore do Android guardado fora do repositório
