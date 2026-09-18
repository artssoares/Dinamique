import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Screen, ScreenHeader, Text, useTheme } from '@dinamique/ui';
import { LEGAL, controllerLine } from '@/features/legal/entity';
import { Bullets, P, Section } from '@/features/legal/Prose';

/**
 * Política de Privacidade (LGPD, Lei 13.709/2018).
 *
 * É o documento que a App Store e a Google Play exigem por URL pública, e o
 * que a LGPD exige em linguagem clara. Ele descreve o que o aplicativo faz de
 * verdade: cada item aqui corresponde a uma tabela do banco ou a uma
 * permissão declarada no `app.json`. Se o aplicativo passar a coletar outra
 * coisa, este texto muda junto.
 */
export default function Privacidade() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen
      header={<ScreenHeader title="Política de Privacidade" onBack={() => router.back()} />}
      gap="2xl"
    >
      <Card padding="lg">
        <Text variant="caption" color="muted">
          Última atualização: {LEGAL.updatedAt}
        </Text>
      </Card>

      <Section title="Quem trata os seus dados">
        <P>
          {controllerLine()} é quem decide como os dados deste aplicativo são usados. Para falar
          sobre privacidade, abra Mais → Suporte dentro do aplicativo
          {LEGAL.email ? ` ou escreva para ${LEGAL.email}` : ''}. Todo pedido é respondido pelo
          mesmo canal.
        </P>
      </Section>

      <Section title="O que coletamos">
        <P>Só o que o aplicativo precisa para fazer a conta fechar:</P>
        <Bullets
          items={[
            'Cadastro: nome, e-mail e senha. Cidade, telefone, data de nascimento e foto são opcionais e marcados como tais na tela.',
            'Trabalho: as corridas, entregas, ganhos, despesas, abastecimentos, quilometragem e horários que você registra.',
            'Veículo: modelo, combustível e consumo, para calcular o custo por quilômetro.',
            'Localização, só com a sua permissão e só com uma jornada aberta: o trajeto que você percorreu, para contar os quilômetros sozinho.',
            'Localização no momento de um alerta de emergência, se você ligar o botão de socorro.',
            'Aparelho: sistema operacional e versão do aplicativo, para entender onde um erro aconteceu.',
            'Uso: quais telas são abertas, sem o conteúdo do que está nelas.',
          ]}
        />
        <P>
          Não temos acesso à sua agenda, aos seus contatos, ao seu microfone nem às suas contas
          nos aplicativos de corrida. O Dinamique não lê os seus ganhos direto da Uber, da 99 ou
          do iFood: o que entra na conta é o que você registra.
        </P>
      </Section>

      <Section title="Para que usamos">
        <Bullets
          items={[
            'Calcular o seu lucro, o seu R$/hora e o seu R$/km, que é a razão de o aplicativo existir.',
            'Guardar o seu histórico para você comparar dias, semanas e meses.',
            'Comparar o seu desempenho com a mediana de outros motoristas, sempre em grupo e nunca mostrando a linha de ninguém.',
            'Responder o seu atendimento no Suporte.',
            'Cobrar a assinatura, quando você assina o Pro.',
            'Avisar sobre manutenção, metas e respostas do suporte, se você deixar.',
          ]}
        />
        <P>
          Não vendemos os seus dados. Não entregamos os seus números a empresa de aplicativo de
          corrida, seguradora, banco ou anunciante.
        </P>
      </Section>

      <Section title="A sua localização">
        <P>
          A leitura só começa quando você abre uma jornada, e para quando você a encerra. Ela
          continua com a tela apagada porque é isso que permite contar o quilômetro rodado sem
          você anotar o odômetro na mão. Fora de uma jornada aberta, o aplicativo não lê onde
          você está.
        </P>
        <P>
          O trajeto fica guardado junto da jornada, só para você, e é o que desenha o mapa do dia
          no Histórico. Ele nunca é vendido, nunca vira publicidade e nunca é entregue a
          plataforma de corrida, seguradora ou banco. Você pode recusar a permissão e continuar
          usando o aplicativo inteiro, digitando a quilometragem.
        </P>
      </Section>

      <Section title="O botão de emergência">
        <P>
          O botão de socorro só existe se você aceitar participar, e nada acontece antes disso.
          Ao disparar um alerta, a sua posição naquele instante, o seu nome e a cor, o modelo e a
          placa que você informou são enviados aos motoristas participantes que estiverem por
          perto, para eles poderem chegar até você.
        </P>
        <P>
          Fora de um alerta ativo ninguém vê a posição de ninguém: quem está perto é calculado no
          servidor, que devolve apenas a distância, nunca a coordenada. Encerrado o alerta, o
          acesso acaba. Você pode sair da rede a qualquer momento, em Mais.
        </P>
      </Section>

      <Section title="Comparação com outros motoristas">
        <P>
          O comparativo só aparece quando existem pelo menos 20 motoristas no mesmo grupo, e ele
          mostra apenas a mediana do grupo. Ninguém, nem você nem a nossa equipe, vê o número
          individual de outra pessoa a partir dessa tela.
        </P>
      </Section>

      <Section title="Quem mais tem acesso">
        <P>
          Três empresas processam dados a nosso pedido, cada uma para uma coisa só: a Supabase
          hospeda o banco de dados, a Vercel hospeda o aplicativo e o painel, e o Stripe processa
          o pagamento da assinatura. Nenhuma delas pode usar os seus dados para outra finalidade.
          O número do seu cartão nunca passa pelo nosso servidor: ele vai direto para o Stripe.
        </P>
      </Section>

      <Section title="Onde ficam e por quanto tempo">
        <P>
          Os dados ficam em servidores na região de São Paulo. Eles permanecem enquanto a sua
          conta existir. Quando você exclui a conta, tudo é apagado (registros, histórico,
          veículo, metas, atendimentos e foto), sem cópia guardada para depois.
        </P>
      </Section>

      <Section title="Os seus direitos">
        <P>
          A LGPD garante que você possa confirmar, acessar, corrigir e eliminar os seus dados, e
          levá-los embora. No aplicativo isso não é um formulário: é um botão.
        </P>
        <Bullets
          items={[
            'Acessar e corrigir: Mais → Meu perfil.',
            'Levar embora: Mais → Exportar meus dados, em planilha.',
            'Eliminar: Mais → Conta e privacidade → Excluir minha conta. A exclusão é imediata e definitiva.',
          ]}
        />
      </Section>

      <Section title="Menores de idade">
        <P>
          O Dinamique é para quem trabalha dirigindo, então é para maiores de 18 anos. Não
          coletamos dados de crianças e adolescentes de propósito.
        </P>
      </Section>

      <Section title="Segurança">
        <P>
          Cada linha do banco é protegida por uma regra que amarra o dado ao dono: mesmo que
          alguém tenha a chave pública do aplicativo, não existe consulta que devolva o registro
          de outra pessoa. O tráfego é criptografado de ponta a ponta.
        </P>
      </Section>

      <Section title="Mudanças">
        <P>
          Se esta política mudar, a data no topo muda junto e avisamos dentro do aplicativo antes
          de a mudança valer.
        </P>
      </Section>

      <View style={{ height: theme.spacing['3xl'] }} />
    </Screen>
  );
}
