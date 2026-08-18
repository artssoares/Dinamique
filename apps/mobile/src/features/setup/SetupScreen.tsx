import { ScrollView, View } from 'react-native';
import { Card, Text, useTheme } from '@dinamique/ui';
import { BrandMark } from '@/features/brand/BrandMark';

/**
 * Mostrada quando faltam as variáveis do Supabase.
 *
 * Existe para que um deploy sem configuração diga o que fazer, em vez de abrir
 * uma tela branca. É uma tela de instalação, não de erro.
 */
export function SetupScreen() {
  const theme = useTheme();

  const steps = [
    {
      title: 'Crie um projeto no Supabase',
      detail: 'Em supabase.com, crie um projeto na região South America (São Paulo).',
    },
    {
      title: 'Rode o arquivo de instalação',
      detail:
        'No SQL Editor do Supabase, cole o conteúdo de supabase/setup.sql e execute. Ele cria as 45 tabelas, as políticas de segurança e os dados iniciais.',
    },
    {
      title: 'Preencha as duas chaves',
      detail:
        'Em Settings → API, copie a Project URL e a chave anon. Coloque em EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    },
    {
      title: 'Refaça o deploy',
      detail:
        'Este passo é obrigatório e costuma ser esquecido: as chaves são embutidas quando o site é construído, então adicioná-las depois não muda o que já está no ar. Na Vercel: Deployments → ⋯ no primeiro da lista → Redeploy, com "Use existing Build Cache" DESMARCADO.',
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}
      contentContainerStyle={{
        padding: theme.spacing.xl,
        paddingTop: theme.spacing['5xl'],
        gap: theme.spacing.xl,
        maxWidth: 560,
        alignSelf: 'center',
        width: '100%',
      }}
    >
      <View style={{ gap: theme.spacing.md }}>
        <BrandMark size="lg" />
        <Text variant="titleLg">Falta conectar o banco de dados</Text>
        <Text variant="body" color="secondary">
          O aplicativo está publicado, mas ainda não sabe onde ficam os dados.
        </Text>
        <Card padding="lg" style={{ backgroundColor: theme.colors.warningSubtle }}>
          <Text variant="captionStrong" color="warning">
            Já preencheu as variáveis e continua vendo esta tela?
          </Text>
          <Text variant="caption" color="secondary">
            Falta refazer o deploy. As chaves entram no site na hora em que ele é construído, então
            elas não valem para uma construção que já aconteceu. É o passo 4 abaixo.
          </Text>
        </Card>
      </View>

      {steps.map((step, index) => (
        <Card key={step.title} padding="xl" style={{ flexDirection: 'row', gap: theme.spacing.lg }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.brandPrimarySubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="captionStrong" color="brand">
              {index + 1}
            </Text>
          </View>
          <View style={{ flex: 1, gap: theme.spacing.xs }}>
            <Text variant="bodyStrong">{step.title}</Text>
            <Text variant="caption" color="secondary">
              {step.detail}
            </Text>
          </View>
        </Card>
      ))}

      <Text variant="caption" color="muted">
        A chave anon é pública por natureza — ela não dá acesso a nada sozinha, porque todas as
        tabelas estão protegidas por Row Level Security. A chave service_role nunca deve entrar
        aqui.
      </Text>
    </ScrollView>
  );
}
