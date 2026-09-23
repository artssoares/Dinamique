import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  Card,
  Field,
  ListRow,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  useTheme,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';

/** A palavra digitada destrava o botão. */
const CONFIRMATION = 'EXCLUIR';

/**
 * Conta e privacidade.
 *
 * A exclusão da conta mora aqui porque precisa existir: a App Store recusa
 * (diretriz 5.1.1(v)) qualquer aplicativo que crie conta e não deixe apagá-la
 * de dentro dele, e a LGPD dá o mesmo direito. Mandar o usuário escrever para
 * um e-mail não cumpre nenhum dos dois.
 *
 * Quem apaga é o banco, numa função só (`delete_my_account`), porque apagar
 * tabela por tabela pelo aplicativo sempre deixaria uma para trás.
 *
 * A confirmação é digitada em vez de um "Tem certeza?": este é o único botão
 * do aplicativo que não tem volta, e um toque errado não pode chegar nele.
 */
export default function Conta() {
  const theme = useTheme();
  const router = useRouter();
  const { profile, plan, signOut } = useSession();

  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = confirmation.trim().toUpperCase() === CONFIRMATION;

  async function remove() {
    if (!armed || deleting) return;

    setDeleting(true);
    setError(null);
    // Aguardado, e não solto: depois da exclusão a sessão não escreve mais nada.
    await track('account_deleted');

    const { data, error: rpcError } = await supabase.rpc('delete_my_account');
    const result = data as { ok?: boolean; reason?: string } | null;

    if (rpcError || !result?.ok) {
      setDeleting(false);
      setError(
        result?.reason === 'not_authenticated'
          ? 'Sua sessão expirou. Entre de novo e tente outra vez.'
          : 'Não conseguimos excluir agora. Tente de novo em instantes.',
      );
      return;
    }

    // A conta não existe mais; a sessão guardada no aparelho também não pode.
    await signOut();
  }

  return (
    <Screen
      header={<ScreenHeader title="Conta e privacidade" onBack={() => router.back()} />}
      gap="2xl"
    >
      <SectionHeader title="Antes de excluir" />

      <Card padding="none">
        <ListRow
          label="Exportar meus dados"
          description="Baixe o seu histórico em planilha. Depois da exclusão não dá."
          icon="download"
          onPress={() => router.push('/export')}
        />
        {plan === 'pro' ? (
          <ListRow
            label="Plano e assinatura"
            description="Cancele a assinatura primeiro para não ser cobrado de novo."
            icon="coins"
            onPress={() => router.push('/plan')}
          />
        ) : null}
        <ListRow
          label="Política de Privacidade"
          icon="shield"
          onPress={() => router.push('/legal/privacidade')}
        />
        <ListRow label="Termos de Uso" icon="info" onPress={() => router.push('/legal/termos')} />
      </Card>

      <SectionHeader title="Excluir minha conta" />

      <Card padding="lg" style={{ gap: theme.spacing.lg }}>
        <Text variant="body" color="secondary">
          Isto apaga, de uma vez e para sempre, a conta de {profile?.firstName ?? 'você'}: todas as
          jornadas, ganhos, despesas, abastecimentos, o veículo, as metas, os atendimentos no
          suporte e a sua foto. Não existe desfazer e não guardamos uma cópia.
        </Text>

        <Field
          label={`Digite ${CONFIRMATION} para liberar o botão`}
          value={confirmation}
          onChangeText={setConfirmation}
          autoCapitalize="characters"
          autoCorrect={false}
          error={error}
        />

        <Button
          label="Excluir minha conta"
          variant="danger"
          iconName="trash"
          fullWidth
          disabled={!armed}
          loading={deleting}
          onPress={remove}
        />

        <Text variant="caption" color="muted">
          Se você assinou o Pro pela App Store ou pela Google Play, cancele também nas assinaturas
          da loja: a cobrança fica com ela, não com a gente.
        </Text>
      </Card>

      <View style={{ height: theme.spacing['3xl'] }} />
    </Screen>
  );
}
