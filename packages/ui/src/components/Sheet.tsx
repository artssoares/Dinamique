import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** Pinned action area under the scrolling body. */
  footer?: ReactNode;
  /** Right-hand control in the title row, e.g. "Limpar tudo". */
  action?: ReactNode;
  /** Fraction of the screen the sheet may occupy. */
  maxHeight?: `${number}%`;
}

/**
 * Bottom sheet.
 *
 * The panel rises on a spring and the scrim fades with it, and closing runs
 * the same motion backwards before the modal unmounts. The platform's own
 * slide was doing the first half of that and nothing at all on the way out,
 * which is what made dismissing feel like the screen had been switched off.
 *
 * On wide screens it stops being full-bleed and centres, so the same component
 * works on a phone, a tablet and the web.
 */
export function Sheet({
  visible,
  onClose,
  title,
  description,
  children,
  footer,
  action,
  maxHeight = '82%',
}: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isMedium, contentWidth } = useResponsive();
  const reduced = useReducedMotion();

  // `mounted` lags `visible` on the way out so the exit animation can play.
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (reduced) {
        progress.setValue(1);
        return;
      }
      const animation = Animated.spring(progress, {
        toValue: 1,
        damping: 22,
        stiffness: 260,
        mass: 0.9,
        useNativeDriver: true,
      });
      animation.start();
      return () => animation.stop();
    }

    if (!mounted) return;
    if (reduced) {
      progress.setValue(0);
      setMounted(false);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: theme.motion.base,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => animation.stop();
  }, [mounted, progress, reduced, theme.motion.base, visible]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{ flex: 1, opacity: progress }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          onPress={onClose}
          style={{
            flex: 1,
            backgroundColor: theme.colors.overlay,
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          <Animated.View
            style={{
              width: '100%',
              maxWidth: isMedium ? contentWidth : undefined,
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [420, 0],
                  }),
                },
              ],
            }}
          >
            <Pressable
              // Swallows taps so pressing inside the sheet does not dismiss it.
              onPress={(event) => event.stopPropagation()}
              style={{
                maxHeight,
                backgroundColor: theme.colors.surfacePrimary,
                borderTopLeftRadius: theme.radius['3xl'],
                borderTopRightRadius: theme.radius['3xl'],
                borderBottomLeftRadius: isMedium ? theme.radius['3xl'] : 0,
                borderBottomRightRadius: isMedium ? theme.radius['3xl'] : 0,
                marginBottom: isMedium ? theme.spacing['3xl'] : 0,
                paddingTop: theme.spacing.md,
                ...theme.elevation.lg,
              }}
            >
              <View
                accessibilityElementsHidden
                style={{
                  alignSelf: 'center',
                  width: 44,
                  height: 5,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.borderStrong,
                }}
              />

              {title ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: theme.spacing.md,
                    paddingHorizontal: theme.spacing.xl,
                    paddingTop: theme.spacing.lg,
                  }}
                >
                  <View style={{ flex: 1, gap: theme.spacing.xxs }}>
                    <Text variant="title">{title}</Text>
                    {description ? (
                      <Text variant="body" color="secondary">
                        {description}
                      </Text>
                    ) : null}
                  </View>
                  {action}
                  <IconButton
                    icon="close"
                    label="Fechar"
                    onPress={onClose}
                    tone="surface"
                    size={40}
                  />
                </View>
              ) : null}

              <ScrollView
                contentContainerStyle={{
                  padding: theme.spacing.xl,
                  paddingBottom: footer ? theme.spacing.lg : insets.bottom + theme.spacing.xl,
                  gap: theme.spacing.lg,
                }}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>

              {footer ? (
                <View
                  style={{
                    padding: theme.spacing.xl,
                    paddingBottom: insets.bottom + theme.spacing.lg,
                    borderTopWidth: 1,
                    borderTopColor: theme.colors.borderSubtle,
                  }}
                >
                  {footer}
                </View>
              ) : null}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}
