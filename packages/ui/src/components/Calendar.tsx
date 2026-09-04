import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { DateOnly } from '@dinamique/types';
import {
  addDays,
  endOfMonth,
  fromDateOnly,
  monthLabel,
  startOfMonth,
  startOfWeek,
  toDateOnly,
} from '@dinamique/utils';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from './IconButton';
import { Text } from './Text';

/** How a day is marked in the grid: the dot under the number. */
export type DayMark = 'positive' | 'negative' | 'neutral';

export interface CalendarProps {
  /** Any day inside the month being shown. */
  month: DateOnly;
  onMonthChange: (month: DateOnly) => void;
  selected?: DateOnly | null;
  onSelect: (date: DateOnly) => void;
  /** Days that already have something recorded, and how each one went. */
  marks?: Readonly<Record<string, DayMark>>;
  /** Nothing after this day can be picked. Defaults to today. */
  maxDate?: DateOnly;
  /** Nothing before this day can be picked. */
  minDate?: DateOnly;
  style?: StyleProp<ViewStyle>;
}

/** Monday first, the working week drivers plan around, same as `startOfWeek`. */
const WEEKDAY_INITIALS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'] as const;
const WEEKDAY_KEYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;

/**
 * A month grid drawn with the app's own tokens rather than a platform picker.
 *
 * Three reasons it is not `@react-native-community/datetimepicker`: the native
 * dialog looks like iOS on iOS and like Android on Android and like neither
 * here; it cannot show which days already have data, which is the whole point
 * of opening it ("which day did I forget?"); and the app also runs on the web,
 * where that picker is a third control again.
 *
 * Future days render but do not select. A day that has not happened cannot be
 * recorded.
 */
export function Calendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  marks,
  maxDate,
  minDate,
  style,
}: CalendarProps) {
  const theme = useTheme();

  const today = toDateOnly(new Date());
  const ceiling = maxDate ?? today;

  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const gridStart = startOfWeek(first);

  // Six rows always, so the grid does not change height between months and
  // shove whatever sits under it up and down.
  const days: DateOnly[] = [];
  for (let index = 0; index < 42; index += 1) {
    days.push(addDays(gridStart, index));
  }

  const previousMonth = addDays(first, -1);
  const nextMonth = addDays(last, 1);
  const canGoForward = nextMonth <= ceiling;

  const markFills: Record<DayMark, string> = {
    positive: theme.colors.success,
    negative: theme.colors.danger,
    neutral: theme.colors.textMuted,
  };

  const title = `${monthLabel(first)} de ${first.slice(0, 4)}`;

  return (
    <View style={[{ gap: theme.spacing.md }, style]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        }}
      >
        <IconButton
          icon="chevronLeft"
          label={`Mês anterior, ${monthLabel(previousMonth)}`}
          tone="surface"
          size={38}
          onPress={() => onMonthChange(startOfMonth(previousMonth))}
        />
        <Text variant="bodyStrong" style={{ flex: 1 }} align="center">
          {title.charAt(0).toUpperCase() + title.slice(1)}
        </Text>
        <IconButton
          icon="chevronRight"
          label={`Próximo mês, ${monthLabel(nextMonth)}`}
          tone="surface"
          size={38}
          disabled={!canGoForward}
          onPress={() => onMonthChange(startOfMonth(nextMonth))}
        />
      </View>

      <View style={{ flexDirection: 'row' }}>
        {WEEKDAY_INITIALS.map((initial, index) => (
          <View key={WEEKDAY_KEYS[index]} style={{ flex: 1, alignItems: 'center' }}>
            <Text variant="overline" color="muted">
              {initial}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <View key={row} style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            {days.slice(row * 7, row * 7 + 7).map((date) => (
              <Day
                key={date}
                date={date}
                inMonth={date >= first && date <= last}
                isToday={date === today}
                isSelected={date === selected}
                mark={marks?.[date]}
                markFills={markFills}
                disabled={date > ceiling || (minDate !== undefined && date < minDate)}
                onPress={() => onSelect(date)}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function Day({
  date,
  inMonth,
  isToday,
  isSelected,
  mark,
  markFills,
  disabled,
  onPress,
}: {
  date: DateOnly;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  mark: DayMark | undefined;
  markFills: Record<DayMark, string>;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const number = fromDateOnly(date).getDate();

  const background = isSelected
    ? theme.colors.brandPrimary
    : mark
      ? theme.colors.backgroundSecondary
      : 'transparent';

  const color = isSelected
    ? theme.colors.textOnBrand
    : !inMonth || disabled
      ? theme.colors.textMuted
      : theme.colors.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected, disabled }}
      accessibilityLabel={`Dia ${number}${mark ? ', com registro' : ', sem registro'}`}
      disabled={disabled}
      onPress={onPress}
      // Seven columns cannot each be 44dp wide on a 360dp phone, so the
      // missing millimetres come back as touch area instead of being dropped.
      hitSlop={6}
      style={({ pressed }) => ({
        flex: 1,
        aspectRatio: 1,
        minHeight: 38,
        maxHeight: 46,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        borderRadius: theme.radius.md,
        backgroundColor: pressed && !isSelected ? theme.colors.surfaceHover : background,
        // Today is said with a ring rather than a fill, so it never competes
        // with the day the driver actually picked.
        borderWidth: isToday && !isSelected ? 1.5 : 0,
        borderColor: theme.colors.brandPrimary,
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <Text variant={isSelected || isToday ? 'captionStrong' : 'caption'} style={{ color }}>
        {number}
      </Text>
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: theme.radius.pill,
          backgroundColor: mark
            ? isSelected
              ? theme.colors.textOnBrand
              : markFills[mark]
            : 'transparent',
        }}
      />
    </Pressable>
  );
}
