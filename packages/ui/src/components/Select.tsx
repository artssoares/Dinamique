import { useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
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
}: SelectProps) {
  const theme = useTheme();
  const { isMedium, contentWidth } = useResponsive();
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value);
  const isEmpty = options.length === 0;

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
        onPress={() => setOpen(true)}
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

            <FlatList
              data={options}
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
