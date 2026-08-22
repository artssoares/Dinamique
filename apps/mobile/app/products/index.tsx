import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatCents, parseCents } from '@dinamique/utils';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Icon,
  Notice,
  Reveal,
  Screen,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  Text,
  useTheme,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { PRODUCT_SUGGESTIONS } from '@/features/products/suggestions';
import { useProducts, type Product } from '@/features/products/useProducts';

/**
 * Meus produtos: the catalogue of what gets sold inside the car.
 *
 * Registering a product is two fields, and the second one is optional. What
 * the passenger pays is required because the sale screen multiplies by it;
 * what the driver paid is not, because plenty of people genuinely do not know
 * and being blocked on it would mean the whole feature goes unused. The screen
 * says out loud what the second number buys them.
 */
export default function Products() {
  const theme = useTheme();
  const router = useRouter();
  const { session, profile, refresh: refreshSession } = useSession();
  const { products, loading, busy, error, dismissError, create, update, archive } = useProducts();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);

  const priceCents = parseCents(price);
  const costCents = parseCents(cost);
  const canSave = name.trim() !== '' && priceCents !== null && priceCents > 0;

  function startAdding(suggested?: string) {
    setEditing(null);
    setName(suggested ?? '');
    setPrice('');
    setCost('');
    setAdding(true);
  }

  function startEditing(product: Product) {
    setEditing(product);
    setName(product.name);
    setPrice((product.unitPrice / 100).toFixed(2).replace('.', ','));
    setCost(product.unitCost === null ? '' : (product.unitCost / 100).toFixed(2).replace('.', ','));
    setAdding(true);
  }

  function cancel() {
    setAdding(false);
    setEditing(null);
    setName('');
    setPrice('');
    setCost('');
    dismissError();
  }

  async function save() {
    if (!canSave || priceCents === null) return;

    const draft = { name, unitPrice: priceCents, unitCost: costCents ?? null };
    const ok = editing ? await update(editing.id, draft) : await create(draft);
    if (!ok) return;

    // Saying yes here is the same answer as saying yes in the onboarding, so
    // the Venda tab appears for someone who found this screen on their own.
    if (session?.user && profile && !profile.sellsProducts) {
      await supabase.from('profiles').update({ sells_products: true }).eq('id', session.user.id);
      await refreshSession();
    }

    cancel();
  }

  function confirmArchive(product: Product) {
    Alert.alert(
      `Tirar "${product.name}" da lista?`,
      'Ele deixa de aparecer na hora de registrar a venda. As vendas que você já lançou continuam no histórico.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Tirar da lista', style: 'destructive', onPress: () => void archive(product.id) },
      ],
    );
  }

  // Only suggest what is not already on the list.
  const remaining = PRODUCT_SUGGESTIONS.filter(
    (suggestion) =>
      !products.some(
        (product) => product.name.trim().toLowerCase() === suggestion.name.toLowerCase(),
      ),
  );

  return (
    <Screen
      header={
        <ScreenHeader
          title="Meus produtos"
          subtitle="O que você vende dentro do carro"
          onBack={() => router.back()}
        />
      }
      gap="lg"
    >
      {error ? <Notice message={error} onDismiss={dismissError} /> : null}

      {loading ? (
        <View style={{ gap: theme.spacing.md }}>
          <Skeleton height={72} radius={theme.radius['2xl']} />
          <Skeleton height={72} radius={theme.radius['2xl']} />
        </View>
      ) : null}

      {!loading && products.length === 0 && !adding ? (
        <Card padding="none" style={{ overflow: 'hidden' }}>
          <EmptyState
            iconName="box"
            title="Nenhum produto ainda"
            description="Água, bala, perfume, carregador. Cadastre com o preço e depois é só contar quantos você vendeu."
            actionLabel="Cadastrar o primeiro"
            onAction={() => startAdding()}
          />
        </Card>
      ) : null}

      {products.map((product) => (
        <Card key={product.id} padding="lg" style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: theme.radius.lg,
                backgroundColor: theme.colors.brandPrimarySubtle,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="box" size={20} color={theme.colors.brandPrimary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {product.name}
              </Text>
              <Text variant="caption" color="secondary">
                Vende por {formatCents(product.unitPrice)}
                {product.unitCost === null
                  ? ''
                  : ` · sobra ${formatCents(product.unitPrice - product.unitCost)}`}
              </Text>
            </View>
            <Text variant="moneyMedium">{formatCents(product.unitPrice)}</Text>
          </View>

          {product.unitCost === null ? (
            <Text variant="caption" color="muted">
              Sem o custo, o Dinamique só sabe quanto entrou, não quanto sobrou.
            </Text>
          ) : null}

          <View
            style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.sm }}
          >
            <Button label="Editar" variant="ghost" size="sm" onPress={() => startEditing(product)} />
            <Button
              label="Tirar da lista"
              variant="ghost"
              size="sm"
              onPress={() => confirmArchive(product)}
            />
          </View>
        </Card>
      ))}

      {adding ? (
        <Reveal>
          <Card padding="xl" style={{ gap: theme.spacing.lg }}>
            <SectionHeader title={editing ? 'Editar produto' : 'Novo produto'} />

            <Field
              label="O que é"
              iconName="box"
              placeholder="Ex.: Perfume"
              value={name}
              onChangeText={setName}
              maxLength={60}
            />

            <Field
              label="Por quanto você vende"
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="R$ 0,00"
            />

            <Field
              label="Quanto te custa"
              optional
              value={cost}
              onChangeText={setCost}
              keyboardType="decimal-pad"
              placeholder="R$ 0,00"
              hint="Com esse valor o app mostra quanto sobra de cada venda, não só quanto entrou."
            />

            {priceCents && costCents ? (
              <Card padding="lg" tone="brand">
                <Text variant="caption" color="brand">
                  Sobram {formatCents(priceCents - costCents)} por unidade vendida.
                </Text>
              </Card>
            ) : null}

            <View
              style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.sm }}
            >
              <Button
                label={editing ? 'Salvar' : 'Adicionar'}
                loading={busy}
                disabled={!canSave}
                iconName="check"
                onPress={save}
              />
              <Button label="Cancelar" variant="ghost" onPress={cancel} />
            </View>
          </Card>
        </Reveal>
      ) : (
        <Button
          label="Adicionar produto"
          variant={products.length === 0 ? 'primary' : 'ghost'}
          fullWidth
          iconName="plus"
          onPress={() => startAdding()}
        />
      )}

      {!adding && remaining.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="captionStrong" color="secondary">
            SUGESTÕES
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {remaining.map((suggestion) => (
              <Chip
                key={suggestion.name}
                label={suggestion.name}
                iconName="plus"
                onPress={() => startAdding(suggestion.name)}
              />
            ))}
          </View>
          <Text variant="caption" color="muted">
            Toque em uma sugestão e só o preço fica faltando.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
