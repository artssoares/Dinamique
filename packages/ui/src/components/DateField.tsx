import { useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { DateOnly } from '@dinamique/types';
import { addDays, friendlyDayLabel, startOfMonth, toDateOnly } from '@dinamique/utils';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../icons/Icon';
import { MIN_TOUCH_TARGET } from '../tokens/index';
import { Button } from './Button';
import { Calendar, type DayMark } from './Calendar';
import { Chip } from './Chip';
import { Sheet } from './Sheet';
import { Text } from './Text';

export interface DateFieldProps {
  label: string;
  value: DateOnly;
  onChange: (date: DateOnly) => void;
  /** Days that already have something recorded, shown as dots in the grid. */
  marks?: Readonly<Record<string, DayMark>>;
  /** The latest day that may be picked. Defaults to today. */
  maxDate?: DateOnly;
  minDate?: DateOnly;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * "Which day is this for?", the control that makes a forgotten Tuesday
 * fixable.
 *
 * Two shortcuts cover almost every real case, because a driver who forgot to
 * record is usually one or two days behind: Hoje and Ontem are one tap. The
 * calendar covers the rest and shows which days already have data, so "which
 * one did I miss?" is answered by looking rather than by remembering.
 */
export function DateField({
  label,
  value,
  onChange,
  marks,
  maxDate,
  minDate,
  hint,
  style,
}: DateFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<DateOnly>(() => startOfMonth(value));

  const today = toDateOnly(new Date());
  const yesterday = addDays(today, -1);
  const isPast = value < today;
  const isOtherDay = value !== today && value !== yesterday;

  return (
    <View style={[{ gap: theme.spacing.sm }, style]}>
      <Text variant="captionStrong" color="secondary">
        {label.toUpperCase()}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Chip label="Hoje" selected={value === today} onPress={() => onChange(today)} />
        <Chip label="Ontem" selected={value === yesterday} onPress={() => onChange(yesterday)} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Escolher outro dia. Selecionado: ${friendlyDayLabel(value, today)}`}
          onPress={() => {
            setMonth(startOfMonth(value));
            setOpen(true);
          }}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 120,
            minHeight: MIN_TOUCH_TARGET,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.xs,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            borderColor: isOtherDay ? theme.colors.brandPrimary : theme.colors.borderPrimary,
            backgroundColor: isOtherDay
              ? theme.colors.brandPrimarySubtle
              : pressed
                ? theme.colors.surfaceHover
                : theme.colors.surfacePrimary,
          })}
        >
          <Icon name="calendar" size={16} color={theme.colors.brandPrimaryText} />
          <Text variant="captionStrong" numberOfLines={1}>
            Outro dia
          </Text>
        </Pressable>
      </View>

      {/* The chosen day is always spelled out. Someone about to save R$ 180
          onto the wrong date should not have to infer it from a lit chip. */}
      <Text variant="caption" color={isPast ? 'warning' : 'secondary'}>
        {isPast ? `Lançando em ${friendlyDayLabel(value, today)}` : friendlyDayLabel(value, today)}
        {hint ? ` · ${hint}` : ''}
      </Text>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Escolha o dia"
        description="Os dias marcados já têm algo registrado."
        footer={
          <Button label="Fechar" variant="secondary" fullWidth onPress={() => setOpen(false)} />
        }
      >
        <Calendar
          month={month}
          onMonthChange={setMonth}
          selected={value}
          marks={marks}
          maxDate={maxDate}
          minDate={minDate}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
        />
      </Sheet>
    </View>
  );
}
