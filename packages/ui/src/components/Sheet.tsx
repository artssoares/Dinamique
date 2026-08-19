import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
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
  /** Fraction of the screen the sheet may occupy. */
  maxHeight?: `${number}%`;
}

/**
 * Bottom sheet. On wide screens it stops being full-bleed and centres, so the
 * same component works on a phone, a tablet and the web.
 */
export function Sheet({
  visible,
  onClose,
  title,
  description,
  children,
  footer,
  maxHeight = '82%',
}: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isMedium, contentWidth } = useResponsive();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
        <Pressable
          // Swallows taps so pressing inside the sheet does not dismiss it.
          onPress={(event) => event.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: isMedium ? contentWidth : undefined,
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
              <IconButton icon="close" label="Fechar" onPress={onClose} tone="surface" size={40} />
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
      </Pressable>
    </Modal>
  );
}
