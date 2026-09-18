import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Screen, ScreenHeader, Text, useTheme } from '@dinamique/ui';
import { LEGAL } from '@/features/legal/entity';
import { Bullets, P, Section } from '@/features/legal/Prose';

/**
 * Página pública de suporte.
 *
 * A App Store exige uma "Support URL" que abra para qualquer pessoa, inclusive
 * para o revisor, que não tem conta. O suporte de verdade é o de dentro do
 * aplicativo. Esta página existe para dizer isso e dar um caminho a quem não
 * consegue nem entrar.
 */
export default function Suporte() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen header={<ScreenHeader title="Suporte" onBack={() => router.back()} />} gap="2xl">
      <Section title="Já tem conta?">
        <P>
          Abra o aplicativo e vá em Mais → Suporte. A conversa fica dentro do aplicativo, com
          histórico, e a resposta chega como notificação. É o canal mais rápido.
        </P>
      </Section>

      <Section title="Não consegue entrar?">
        <Bullets
          items={[
            'Senha esquecida: na tela de entrada, toque em "Esqueci minha senha" e siga o e-mail.',
            'O e-mail não chegou: confira a caixa de spam antes de pedir de novo.',
            'A tela diz que falta conectar o banco de dados: é um erro nosso de configuração, não seu. Avise pelo canal abaixo.',
          ]}
        />
      </Section>

      <Section title="Falar com a gente">
        <P>
          {LEGAL.email
            ? `Escreva para ${LEGAL.email}. Respondemos em até dois dias úteis.`
            : 'O canal oficial é o Suporte dentro do aplicativo, em Mais → Suporte. Respondemos em até dois dias úteis.'}
        </P>
      </Section>

      <Card padding="lg" style={{ gap: theme.spacing.xs }}>
        <Text variant="captionStrong">Documentos</Text>
        <Text variant="caption" color="muted">
          {LEGAL.app}/legal/privacidade · Política de Privacidade
        </Text>
        <Text variant="caption" color="muted">
          {LEGAL.app}/legal/termos · Termos de Uso
        </Text>
        <Text variant="caption" color="muted">
          {LEGAL.app}/legal/excluir-conta · Como excluir a conta
        </Text>
      </Card>

      <View style={{ height: theme.spacing['3xl'] }} />
    </Screen>
  );
}
