import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { DateOnly } from '@dinamique/types';
import { fromDateOnly, weekdayLabel } from '@dinamique/utils';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import type { DayMark } from './Calendar';

export interface DayStripProps {
  /** The days to show, oldest first. Usually `lastDays(today, 7)`. */
  days: readonly DateOnly[];
  onSelect: (date: DateOnly) => void;
  /** Days that already have something recorded, and how each one went. */
  marks?: Readonly<Record<string, DayMark>>;
  /** Drawn with a ring. Defaults to the last day in `days`. */
  today?: DateOnly;
  style?: StyleProp<ViewStyle>;
}

/**
 * A week of days as a row of columns, small enough to sit on a screen that is
 * about something else.
 *
 * The month grid in `Calendar` answers "which day did I forget?" and needs a
 * sheet to open in. This answers the far more common "ontem", "anteontem", and
 * it has to be reachable without opening anything: the whole reason a
 * forgotten Tuesday stays forgotten is that fixing it costs four taps.
 *
 * The dot is the same language as the grid: it is there when the day has
 * something recorded, and its colour is the sign of the day. A day with no dot
 * is not broken, it is empty, and tapping it is how it stops being empty.
 */
export function DayStrip({ days, onSelect, marks, today, style }: DayStripProps) {
  const theme = useTheme();
  const current = today ?? days[days.length - 1];

  const markFills: Record<DayMark, string> = {
    positive: theme.colors.success,
    negative: theme.colors.danger,
    neutral: theme.colors.textMuted,
  };

  return (
    <View style={[{ flexDirection: 'row', gap: theme.spacing.xs }, style]}>
      {days.map((date) => (
        <Day
          key={date}
          date={date}
          isToday={date === current}
          mark={marks?.[date]}
          markFills={markFills}
          onPress={() => onSelect(date)}
        />
      ))}
    </View>
  );
}

function Day({
  date,
  isToday,
  mark,
  markFills,
  onPress,
}: {
  date: DateOnly;
  isToday: boolean;
  mark: DayMark | undefined;
  markFills: Record<DayMark, string>;
  onPress: () => void;
}) {
  const theme = useTheme();
  const number = fromDateOnly(date).getDate();
  // A inicial do dia da semana. "sábado" e "sexta-feira" começam com a mesma
  // letra, e é assim na grade do mês também: quem lê a coluna lê a data
  // debaixo dela.
  const initial = weekdayLabel(date).charAt(0).toUpperCase();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${isToday ? 'Hoje' : weekdayLabel(date)}, dia ${number}${
        mark ? ', com registro' : ', sem registro'
      }`}
      onPress={onPress}
      // Sete colunas não cabem com 44dp cada num telefone de 360dp, então os
      // milímetros que faltam voltam como área de toque, igual à grade do mês.
      hitSlop={6}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: pressed
          ? theme.colors.surfaceHover
          : mark
            ? theme.colors.backgroundSecondary
            : 'transparent',
        // Hoje é dito com um anel, nunca com um preenchimento, para não
        // competir com os dias que têm registro.
        borderWidth: isToday ? 1.5 : 0,
        borderColor: theme.colors.brandPrimary,
      })}
    >
      <Text variant="overline" color="muted">
        {initial}
      </Text>
      <Text variant={isToday ? 'captionStrong' : 'caption'}>{number}</Text>
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: theme.radius.pill,
          backgroundColor: mark ? markFills[mark] : 'transparent',
        }}
      />
    </Pressable>
  );
}
