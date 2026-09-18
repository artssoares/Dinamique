import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, ScreenHeader, useTheme } from '@dinamique/ui';
import { LEGAL } from '@/features/legal/entity';
import { Bullets, P, Section } from '@/features/legal/Prose';

/**
 * Página pública sobre exclusão de conta.
 *
 * A Google Play pede, no formulário de Segurança dos Dados, uma URL que
 * explique como apagar a conta, aberta, sem login. A exclusão em si continua
 * sendo um botão dentro do aplicativo; esta página só documenta o caminho.
 */
export default function ExcluirConta() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen
      header={<ScreenHeader title="Excluir a sua conta" onBack={() => router.back()} />}
      gap="2xl"
    >
      <Section title="Onde fica">
        <P>
          Dentro do aplicativo, em Mais → Conta e privacidade → Excluir minha conta. Você digita a
          palavra EXCLUIR para liberar o botão, e pronto. Não precisa pedir para ninguém, não
          precisa escrever e-mail e não há prazo de espera.
        </P>
      </Section>

      <Section title="O que é apagado">
        <Bullets
          items={[
            'A conta e o cadastro: nome, e-mail, telefone, cidade e foto.',
            'Todo o histórico: jornadas, ganhos, despesas, abastecimentos e quilometragem.',
            'Os trajetos gravados pelo GPS e os mapas do dia feitos a partir deles.',
            'A sua participação na rede de socorro, com a placa e a cor que você informou.',
            'Veículo, metas, custos fixos, manutenções, multas e Free Flow.',
            'Atendimentos no suporte e notificações recebidas.',
            'Códigos de indicação que pertenciam a você.',
          ]}
        />
        <P>
          A exclusão é imediata e definitiva: não guardamos uma cópia para reativar depois. Se
          quiser levar o seu histórico, exporte em planilha antes, em Mais → Exportar meus dados.
        </P>
      </Section>

      <Section title="O que não é apagado por nós">
        <P>
          Se você assinou o Pro pela App Store ou pela Google Play, a cobrança é da loja: cancele
          a assinatura lá também, nas assinaturas da sua conta Apple ou Google. Registros fiscais
          de pagamentos já feitos ficam com o processador de pagamento pelo prazo que a lei exige.
        </P>
      </Section>

      <Section title="Não consegue entrar para excluir?">
        <P>
          Fale com a gente em {LEGAL.app}/legal/suporte
          {LEGAL.email ? ` ou em ${LEGAL.email}` : ''} e apagamos a conta por você depois de
          confirmar que ela é sua.
        </P>
      </Section>

      <View style={{ height: theme.spacing['3xl'] }} />
    </Screen>
  );
}
