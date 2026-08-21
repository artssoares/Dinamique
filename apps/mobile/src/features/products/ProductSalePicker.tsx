import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatCents } from '@dinamique/utils';
import { Button, Card, EmptyState, Icon, Stepper, Text, useTheme } from '@dinamique/ui';
import { totalsFor, type SaleLine } from './sales';
import type { Product } from './useProducts';

export interface ProductSalePickerProps {
  products: Product[];
  /** Units per product id. Absent means none. */
  quantities: Record<string, number>;
  onChange: (productId: string, quantity: number) => void;
  /** Shown while the catalogue is still being read. */
  loading?: boolean;
}

/**
 * "Quantos você vendeu?"
 *
 * One row per product, a minus and a plus, and the running total underneath.
 * The alternative, typing an amount, means the driver doing the multiplication
 * in their head at a traffic light and the app trusting the result. Counting
 * units is the thing they actually know, and the price is already on file.
 *
 * Rows with a count light up so the basket can be read at a glance without
 * comparing five numbers.
 */
export function ProductSalePicker({
  products,
  quantities,
  onChange,
  loading = false,
}: ProductSalePickerProps) {
  const theme = useTheme();
  const router = useRouter();

  const lines: SaleLine[] = products.map((product) => ({
    product,
    quantity: quantities[product.id] ?? 0,
  }));
  const totals = totalsFor(lines);

  if (loading) {
    return (
      <Card padding="xl">
        <Text variant="body" color="secondary" align="center">
          Carregando seus produtos...
        </Text>
      </Card>
    );
  }

  if (products.length === 0) {
    return (
      <Card padding="none" style={{ overflow: 'hidden' }}>
        <EmptyState
          iconName="box"
          title="Nenhum produto cadastrado"
          description="Cadastre o que você vende no carro, com o preço, e depois é só contar quantos saíram."
          actionLabel="Cadastrar produtos"
          onAction={() => router.push('/products')}
        />
      </Card>
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      {lines.map(({ product, quantity }) => {
        const selling = quantity > 0;
        return (
          <Card
            key={product.id}
            padding="lg"
            tone={selling ? 'brand' : 'surface'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {product.name}
              </Text>
              <Text variant="caption" color="secondary">
                {formatCents(product.unitPrice)} cada
                {selling ? ` · ${formatCents(product.unitPrice * quantity)}` : ''}
              </Text>
            </View>

            <Stepper
              value={quantity}
              label={product.name}
              onChange={(next) => onChange(product.id, next)}
            />
          </Card>
        );
      })}

      {totals.units > 0 ? (
        <Card padding="lg" style={{ gap: theme.spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Icon name="box" size={18} color={theme.colors.brandPrimary} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {totals.units === 1 ? '1 item vendido' : `${totals.units} itens vendidos`}
            </Text>
            <Text variant="moneyMedium" color="success">
              {formatCents(totals.gross)}
            </Text>
          </View>
          {/* Only said when it can be said honestly: without a unit cost, the
              "profit" would be the takings with a different label. */}
          {totals.hasCost ? (
            <Text variant="caption" color="secondary">
              Descontando {formatCents(totals.cost)} de mercadoria, sobram{' '}
              {formatCents(totals.profit)}.
            </Text>
          ) : (
            <Text variant="caption" color="muted">
              Informe quanto cada produto te custa, em Meus produtos, para ver quanto sobra.
            </Text>
          )}
        </Card>
      ) : null}

      <Button
        label="Gerenciar meus produtos"
        variant="ghost"
        size="sm"
        iconName="box"
        onPress={() => router.push('/products')}
      />
    </View>
  );
}
