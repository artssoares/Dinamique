import { useEffect, useState } from 'react';
import { Alert, ScrollView, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { formatCents } from '@dinamique/utils';
import { DEFAULT_REFERRAL_DISCOUNT } from '@dinamique/business-logic';
import { Button, Card, EmptyState, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';

interface MyReferral {
  id: string;
  referred_first_name: string;
  created_at: string;
  status: string;
}

/**
 * "Indique um motorista" (§81–86). The benefit belongs to the person being
 * invited, and the copy says so plainly rather than implying a reward the
 * referrer does not get.
 */
export default function Referrals() {
  const theme = useTheme();
  const { session } = useSession();
  const [code, setCode] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<MyReferral[]>([]);

  useEffect(() => {
    if (!session?.user) return;

    void supabase
      .from('promotion_codes')
      .select('code')
      .eq('owner_user_id', session.user.id)
      .eq('kind', 'referral')
      .maybeSingle()
      .then(({ data }) => setCode((data?.code as string | undefined) ?? null));

    void supabase
      .from('my_referrals')
      .select('id, referred_first_name, created_at, status')
      .order('created_at', { ascending: false })
      .then(({ data }) => setReferrals((data as MyReferral[] | null) ?? []));
  }, [session?.user?.id]);

  const link = code ? `https://dinamique.app/convite/${code}` : null;

  async function copy(value: string, what: string) {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copiado', `${what} copiado para a área de transferência.`);
  }

  async function share() {
    if (!link || !code) return;
    void track('referral_shared', { code });
    await Share.share({
      message:
        `Uso o Dinamique para saber quanto realmente ganho dirigindo. ` +
        `Entra pelo meu convite e você ganha ${formatCents(DEFAULT_REFERRAL_DISCOUNT)} de desconto: ${link}`,
    });
  }

  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="titleLg">Indique um motorista</Text>
        <Text variant="body" color="secondary">
          Convide alguém para usar o Dinamique. Quem entrar pelo seu convite recebe{' '}
          {formatCents(DEFAULT_REFERRAL_DISCOUNT)} de desconto na primeira assinatura Pro.
        </Text>
      </View>

      <Card padding="xl" style={{ gap: theme.spacing.lg, alignItems: 'center' }}>
        <Text variant="caption" color="secondary">
          SEU CÓDIGO
        </Text>
        <Text variant="display" color="brand">
          {code ?? '···'}
        </Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button
            label="Compartilhar convite"
            onPress={share}
            disabled={!code}
          />
          <Button
            label="Copiar código"
            variant="ghost"
            onPress={() => code && copy(code, 'Código')}
            disabled={!code}
          />
          <Button
            label="Copiar link"
            variant="ghost"
            onPress={() => link && copy(link, 'Link')}
            disabled={!link}
          />
        </View>
      </Card>

      <View style={{ gap: theme.spacing.md }}>
        <Text variant="captionStrong" color="secondary">
          MINHAS INDICAÇÕES
        </Text>

        {referrals.length === 0 ? (
          <EmptyState
            title="Ninguém entrou ainda"
            description="Compartilhe seu convite com outros motoristas que você conhece."
          />
        ) : (
          <>
            <Text variant="body" color="secondary">
              {referrals.length === 1
                ? '1 pessoa entrou pelo seu convite.'
                : `${referrals.length} pessoas entraram pelo seu convite.`}
            </Text>
            {referrals.map((referral) => (
              <Card key={referral.id} padding="lg">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="bodyStrong">{referral.referred_first_name}</Text>
                  <Text variant="caption" color="secondary">
                    {new Date(referral.created_at).toLocaleDateString('pt-BR')}
                  </Text>
                </View>
                <Text variant="caption" color="secondary">
                  Cadastro realizado
                </Text>
              </Card>
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}
