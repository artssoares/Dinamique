import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Screen, ScreenHeader, Text, useTheme } from '@dinamique/ui';
import { LEGAL, controllerLine } from '@/features/legal/entity';
import { Bullets, P, Section } from '@/features/legal/Prose';

/**
 * Termos de Uso.
 *
 * A App Store exige um link para os termos na ficha de qualquer aplicativo com
 * assinatura, e a Google Play exige o mesmo para compra dentro do aplicativo.
 */
export default function Termos() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen
      header={<ScreenHeader title="Termos de Uso" onBack={() => router.back()} />}
      gap="2xl"
    >
      <Card padding="lg">
        <Text variant="caption" color="muted">
          Última atualização: {LEGAL.updatedAt}
        </Text>
      </Card>

      <Section title="O que o Dinamique é">
        <P>
          Um aplicativo para quem ganha dinheiro com um veículo registrar o que entrou e o que
          saiu, e enxergar quanto sobrou de verdade. {controllerLine()} oferece o serviço nos
          termos abaixo; usar o aplicativo significa concordar com eles.
        </P>
      </Section>

      <Section title="O que o Dinamique não é">
        <Bullets
          items={[
            'Não é consultoria contábil, financeira, jurídica ou tributária. Os números são um retrato do que você registrou, não uma recomendação.',
            'Não tem vínculo com Uber, 99, iFood, Rappi, Lalamove ou qualquer outra plataforma, e não acessa as contas que você tem nelas.',
            'Não declara imposto por você e não substitui o seu contador.',
          ]}
        />
      </Section>

      <Section title="A sua conta">
        <P>
          A conta é pessoal e a senha é sua responsabilidade. Você precisa ter 18 anos ou mais.
          Podemos encerrar uma conta que use o aplicativo para fraude, por exemplo criar contas
          em série para resgatar o mesmo código de indicação.
        </P>
      </Section>

      <Section title="O botão de emergência não é o 190">
        <P>
          O socorro do Dinamique avisa outros motoristas que aceitaram participar e que estejam
          por perto. Ele não aciona polícia, ambulância nem bombeiro, não garante que alguém
          esteja por perto e não garante que alguém vá. Em emergência, ligue para 190 ou 192
          primeiro. O recurso depende de bateria, de sinal e de haver participantes na região.
        </P>
      </Section>

      <Section title="Os seus dados são seus">
        <P>
          O que você registra continua seu. Você pode exportar tudo em planilha a qualquer momento
          e pode excluir a conta de dentro do aplicativo, sem pedir autorização a ninguém.
        </P>
      </Section>

      <Section title="Plano Free e plano Pro">
        <P>
          O Free é gratuito e continua funcionando. O Pro é uma assinatura mensal ou anual que
          renova sozinha até você cancelar, e o preço aparece na tela antes da confirmação. Toda
          conta nova começa com 7 dias de Pro.
        </P>
        <P>
          Onde você cancela depende de onde assinou: uma assinatura feita pela App Store ou pela
          Google Play se cancela nas assinaturas da própria loja; uma assinatura feita pelo site
          se cancela em Mais → Plano e assinatura. Cancelar encerra a renovação, e o período já
          pago continua até o fim, sem devolução proporcional.
        </P>
      </Section>

      <Section title="Precisão dos números">
        <P>
          A conta é feita sobre o que você registra. Um abastecimento esquecido ou uma
          quilometragem errada mudam o resultado. Quando falta um dado para um cálculo, o
          aplicativo mostra um traço e diz o que falta, em vez de inventar um número.
        </P>
      </Section>

      <Section title="Interrupções">
        <P>
          Fazemos o possível para o serviço ficar sempre no ar, mas ele pode sair por manutenção
          ou por falha de um fornecedor. Isso não gera indenização, e os seus dados continuam lá
          quando volta.
        </P>
      </Section>

      <Section title="Mudanças nestes termos">
        <P>
          Se algo mudar, a data no topo muda junto e avisamos dentro do aplicativo. Continuar
          usando depois do aviso significa concordar com a nova versão.
        </P>
      </Section>

      <Section title="Lei e foro">
        <P>
          Estes termos seguem a lei brasileira. Questões de consumo podem ser levadas ao foro do
          seu domicílio, como o Código de Defesa do Consumidor garante.
        </P>
      </Section>

      <Section title="Contato">
        <P>
          Abra Mais → Suporte dentro do aplicativo
          {LEGAL.email ? ` ou escreva para ${LEGAL.email}` : ''}. É o mesmo canal para dúvida,
          reclamação e pedido sobre dados.
        </P>
      </Section>

      <View style={{ height: theme.spacing['3xl'] }} />
    </Screen>
  );
}
