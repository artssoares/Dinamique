import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import { Icon } from '../icons/Icon';
import { MIN_TOUCH_TARGET } from '../tokens/index';
import { Text } from './Text';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface SelectProps {
  label: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  optional?: boolean;
  disabled?: boolean;
  /** Mostrado quando não há nenhuma opção disponível. */
  emptyLabel?: string;
  /**
   * A partir de quantas opções a folha abre com um campo de busca.
   *
   * Existe porque o catálogo de veículos passou a ter dezenas de modelos por
   * marca. Rolar uma lista de quarenta Hondas atrás da sua é pior do que uma
   * lista curta e errada: a pessoa desiste e vai para o campo livre, que é
   * exatamente o que o catálogo existe para evitar.
   */
  searchAfter?: number;
}

/**
 * Seleção em folha modal. Uma lista longa (marcas, modelos) não cabe em chips,
 * e um seletor nativo se comporta de forma diferente em cada plataforma.
 */
export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = 'Selecione',
  optional,
  disabled,
  emptyLabel = 'Nada disponível',
  searchAfter = 8,
}: SelectProps) {
  const theme = useTheme();
  const { isMedium, contentWidth } = useResponsive();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((option) => option.value === value);
  const isEmpty = options.length === 0;
  const searchable = options.length >= searchAfter;

  // Sem acento e sem caixa: quem digita "citroen" ou "HB20" no meio do nome
  // está procurando a mesma coisa que quem digita "Citroën" e "hb20".
  const visible = useMemo(() => {
    const term = fold(query);
    if (term === '') return options;
    return options.filter(
      (option) => fold(option.label).includes(term) || fold(option.hint ?? '').includes(term),
    );
  }, [options, query]);

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'baseline' }}>
        <Text variant="captionStrong" color="secondary">
          {label.toUpperCase()}
        </Text>
        {optional ? (
          <Text variant="caption" color="muted">
            opcional
          </Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        accessibilityState={{ disabled: disabled || isEmpty }}
        disabled={disabled || isEmpty}
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
        style={({ pressed }) => ({
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: theme.radius.lg,
          borderWidth: 1.5,
          borderColor: theme.colors.borderPrimary,
          backgroundColor: theme.colors.surfacePrimary,
          paddingHorizontal: theme.spacing.lg,
          opacity: disabled || isEmpty ? 0.5 : pressed ? 0.85 : 1,
        })}
      >
        <Text variant="body" color={selected ? 'primary' : 'muted'}>
          {isEmpty ? emptyLabel : (selected?.label ?? placeholder)}
        </Text>
        <Icon name="chevronDown" size={18} color={theme.colors.textSecondary} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable
          accessibilityLabel="Fechar"
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: theme.colors.overlay,
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: isMedium ? contentWidth : undefined,
              maxHeight: '70%',
              backgroundColor: theme.colors.surfacePrimary,
              borderTopLeftRadius: theme.radius['3xl'],
              borderTopRightRadius: theme.radius['3xl'],
              padding: theme.spacing.xl,
              gap: theme.spacing.md,
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.borderStrong,
              }}
            />
            <Text variant="subtitle">{label}</Text>

            {searchable ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  borderRadius: theme.radius.lg,
                  borderWidth: 1.5,
                  borderColor: theme.colors.borderPrimary,
                  backgroundColor: theme.colors.surfacePrimary,
                  paddingHorizontal: theme.spacing.md,
                  minHeight: MIN_TOUCH_TARGET,
                }}
              >
                <Icon name="search" size={18} color={theme.colors.textSecondary} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Buscar"
                  placeholderTextColor={theme.colors.textMuted}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel={`Buscar em ${label}`}
                  style={{
                    flex: 1,
                    paddingVertical: theme.spacing.sm,
                    color: theme.colors.textPrimary,
                    ...(theme.typography.body as object),
                  }}
                />
                {query !== '' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Limpar busca"
                    hitSlop={10}
                    onPress={() => setQuery('')}
                  >
                    <Icon name="close" size={16} color={theme.colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <FlatList
              data={visible}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text variant="caption" color="muted" style={{ paddingVertical: theme.spacing.lg }}>
                  Nada com esse nome. Se o seu não estiver na lista, dá para escrever o modelo à
                  mão na tela anterior.
                </Text>
              }
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.value === value }}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => ({
                    minHeight: MIN_TOUCH_TARGET + 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.md,
                    paddingVertical: theme.spacing.md,
                    paddingHorizontal: theme.spacing.sm,
                    borderRadius: theme.radius.md,
                    backgroundColor: pressed ? theme.colors.surfaceHover : 'transparent',
                  })}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" color={item.value === value ? 'brand' : 'primary'}>
                      {item.label}
                    </Text>
                    {item.hint ? (
                      <Text variant="caption" color="muted">
                        {item.hint}
                      </Text>
                    ) : null}
                  </View>
                  {item.value === value ? (
                    <Icon name="check" size={18} color={theme.colors.brandPrimary} />
                  ) : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Sem acento e sem caixa, para a busca casar com o que a pessoa digita. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
