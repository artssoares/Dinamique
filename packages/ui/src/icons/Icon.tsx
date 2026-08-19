import Svg, { Circle, Line, Path, Polyline, Rect, type SvgProps } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';

/**
 * The icon set.
 *
 * It replaces the unicode glyphs the app used to draw (`◎ ▤ ◈ ⋯ ›`). Those
 * rendered at a different weight, size and vertical offset on every device,
 * which is why navigation looked homemade. These are real 24×24 stroke icons
 * on a single grid: 1.8 stroke, round caps, no fills except where a shape must
 * read solid at 16dp.
 *
 * Every icon takes its colour from `color`, defaulting to the current text
 * colour, so an icon never needs a hex.
 */

export type IconName =
  | 'home'
  | 'history'
  | 'insights'
  | 'more'
  | 'plus'
  | 'bell'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'close'
  | 'check'
  | 'menu'
  | 'car'
  | 'fuel'
  | 'target'
  | 'wallet'
  | 'receipt'
  | 'clock'
  | 'play'
  | 'pause'
  | 'stop'
  | 'trendUp'
  | 'trendDown'
  | 'settings'
  | 'user'
  | 'support'
  | 'gift'
  | 'star'
  | 'shield'
  | 'download'
  | 'arrowUpRight'
  | 'arrowDownLeft'
  | 'wrench'
  | 'alert'
  | 'info'
  | 'eye'
  | 'eyeOff'
  | 'logout'
  | 'camera'
  | 'sun'
  | 'moon'
  | 'phone'
  | 'route'
  | 'megaphone'
  | 'compass'
  | 'flag';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, color, strokeWidth = 1.8 }: IconProps) {
  const theme = useTheme();
  const stroke = color ?? theme.colors.textPrimary;

  const common: SvgProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  switch (name) {
    case 'home':
      return (
        <Svg {...common}>
          <Path d="M3.5 10.5 12 3.75l8.5 6.75V19a1.5 1.5 0 0 1-1.5 1.5h-3.5v-6h-7v6H5A1.5 1.5 0 0 1 3.5 19z" />
        </Svg>
      );
    case 'history':
      return (
        <Svg {...common}>
          <Rect x="3.25" y="4.25" width="17.5" height="15.5" rx="3" />
          <Line x1="3.25" y1="9.25" x2="20.75" y2="9.25" />
          <Line x1="7.5" y1="13.25" x2="12.5" y2="13.25" />
          <Line x1="7.5" y1="16.5" x2="10" y2="16.5" />
        </Svg>
      );
    case 'insights':
      return (
        <Svg {...common}>
          <Line x1="4" y1="20" x2="20" y2="20" />
          <Rect x="5.5" y="12" width="3.5" height="5" rx="1.2" />
          <Rect x="10.25" y="8" width="3.5" height="9" rx="1.2" />
          <Rect x="15" y="4.5" width="3.5" height="12.5" rx="1.2" />
        </Svg>
      );
    case 'more':
      return (
        <Svg {...common} fill={stroke} stroke="none">
          <Circle cx="5.5" cy="12" r="1.7" />
          <Circle cx="12" cy="12" r="1.7" />
          <Circle cx="18.5" cy="12" r="1.7" />
        </Svg>
      );
    case 'plus':
      return (
        <Svg {...common} strokeWidth={strokeWidth + 0.4}>
          <Line x1="12" y1="5.5" x2="12" y2="18.5" />
          <Line x1="5.5" y1="12" x2="18.5" y2="12" />
        </Svg>
      );
    case 'bell':
      return (
        <Svg {...common}>
          <Path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 3.2.7 5 1.5 6h-14c.8-1 1.5-2.8 1.5-6z" />
          <Path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
        </Svg>
      );
    case 'chevronLeft':
      return (
        <Svg {...common} strokeWidth={strokeWidth + 0.2}>
          <Polyline points="14.5,5.5 8,12 14.5,18.5" />
        </Svg>
      );
    case 'chevronRight':
      return (
        <Svg {...common} strokeWidth={strokeWidth + 0.2}>
          <Polyline points="9.5,5.5 16,12 9.5,18.5" />
        </Svg>
      );
    case 'chevronDown':
      return (
        <Svg {...common} strokeWidth={strokeWidth + 0.2}>
          <Polyline points="5.5,9.5 12,16 18.5,9.5" />
        </Svg>
      );
    case 'close':
      return (
        <Svg {...common} strokeWidth={strokeWidth + 0.2}>
          <Line x1="6.5" y1="6.5" x2="17.5" y2="17.5" />
          <Line x1="17.5" y1="6.5" x2="6.5" y2="17.5" />
        </Svg>
      );
    case 'check':
      return (
        <Svg {...common} strokeWidth={strokeWidth + 0.4}>
          <Polyline points="5,12.5 10,17.5 19,7" />
        </Svg>
      );
    case 'menu':
      return (
        <Svg {...common} strokeWidth={strokeWidth + 0.2}>
          <Line x1="4.5" y1="7.5" x2="19.5" y2="7.5" />
          <Line x1="4.5" y1="12" x2="14.5" y2="12" />
          <Line x1="4.5" y1="16.5" x2="19.5" y2="16.5" />
        </Svg>
      );
    case 'car':
      return (
        <Svg {...common}>
          <Path d="M4 15.5v-2.2l1.9-4.6A2 2 0 0 1 7.75 7.5h8.5a2 2 0 0 1 1.85 1.2l1.9 4.6v2.2" />
          <Path d="M3.5 15.5h17v2.2a.8.8 0 0 1-.8.8h-1.9a.8.8 0 0 1-.8-.8v-.9H7v.9a.8.8 0 0 1-.8.8H4.3a.8.8 0 0 1-.8-.8z" />
          <Line x1="6.5" y1="12.5" x2="8.5" y2="12.5" />
          <Line x1="15.5" y1="12.5" x2="17.5" y2="12.5" />
        </Svg>
      );
    case 'fuel':
      return (
        <Svg {...common}>
          <Path d="M5 20.5V5.5a2 2 0 0 1 2-2h4.5a2 2 0 0 1 2 2v15" />
          <Line x1="3.75" y1="20.5" x2="14.75" y2="20.5" />
          <Line x1="6.75" y1="9.25" x2="11.75" y2="9.25" />
          <Path d="M13.5 8h3a1.5 1.5 0 0 1 1.5 1.5v6a1.6 1.6 0 0 0 1.6 1.6c.9 0 1.4-.7 1.4-1.6V8.2L18.6 5.5" />
        </Svg>
      );
    case 'target':
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="8" />
          <Circle cx="12" cy="12" r="4.2" />
          <Circle cx="12" cy="12" r="1" fill={stroke} />
        </Svg>
      );
    case 'wallet':
      return (
        <Svg {...common}>
          <Path d="M3.5 8.25A2.25 2.25 0 0 1 5.75 6h11.5a2.25 2.25 0 0 1 2.25 2.25v9.5A2.25 2.25 0 0 1 17.25 20H5.75A2.25 2.25 0 0 1 3.5 17.75z" />
          <Path d="M3.5 9.5V6.9a1.9 1.9 0 0 1 1.4-1.83l9-2.02" />
          <Circle cx="16.25" cy="13" r="1.15" fill={stroke} stroke="none" />
        </Svg>
      );
    case 'receipt':
      return (
        <Svg {...common}>
          <Path d="M5.5 3.5h13v17l-2.2-1.5-2.2 1.5-2.1-1.5-2.2 1.5-2.2-1.5-2.1 1.5z" />
          <Line x1="8.75" y1="8.5" x2="15.25" y2="8.5" />
          <Line x1="8.75" y1="12.5" x2="13" y2="12.5" />
        </Svg>
      );
    case 'clock':
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="8.25" />
          <Polyline points="12,7 12,12 15.5,14" />
        </Svg>
      );
    case 'play':
      return (
        <Svg {...common} fill={stroke} stroke={stroke}>
          <Path d="M8.5 5.8a.9.9 0 0 1 1.36-.77l8 6.2a.9.9 0 0 1 0 1.54l-8 6.2A.9.9 0 0 1 8.5 18.2z" />
        </Svg>
      );
    case 'pause':
      return (
        <Svg {...common} fill={stroke} stroke="none">
          <Rect x="7.5" y="5.5" width="3.4" height="13" rx="1.5" />
          <Rect x="13.1" y="5.5" width="3.4" height="13" rx="1.5" />
        </Svg>
      );
    case 'stop':
      return (
        <Svg {...common} fill={stroke} stroke="none">
          <Rect x="6.5" y="6.5" width="11" height="11" rx="2.6" />
        </Svg>
      );
    case 'trendUp':
      return (
        <Svg {...common}>
          <Polyline points="3.5,16.5 9.5,10.5 13,14 20.5,6.5" />
          <Polyline points="15,6.5 20.5,6.5 20.5,12" />
        </Svg>
      );
    case 'trendDown':
      return (
        <Svg {...common}>
          <Polyline points="3.5,7.5 9.5,13.5 13,10 20.5,17.5" />
          <Polyline points="15,17.5 20.5,17.5 20.5,12" />
        </Svg>
      );
    case 'settings':
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="3" />
          <Path d="M19.4 14.4a1.5 1.5 0 0 0 .3 1.65l.06.06a1.8 1.8 0 1 1-2.55 2.55l-.06-.06a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37v.18a1.8 1.8 0 1 1-3.6 0v-.1a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.06.06A1.8 1.8 0 1 1 5.76 16.2l.06-.06a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9h-.18a1.8 1.8 0 1 1 0-3.6h.1a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.06-.06A1.8 1.8 0 1 1 8.23 4.75l.06.06a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37v-.18a1.8 1.8 0 1 1 3.6 0v.1a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.06-.06a1.8 1.8 0 1 1 2.55 2.55l-.06.06a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9h.18a1.8 1.8 0 1 1 0 3.6h-.1a1.5 1.5 0 0 0-1.37.9z" />
        </Svg>
      );
    case 'user':
      return (
        <Svg {...common}>
          <Circle cx="12" cy="8.5" r="3.75" />
          <Path d="M4.75 20.25a7.25 7.25 0 0 1 14.5 0" />
        </Svg>
      );
    case 'support':
      return (
        <Svg {...common}>
          <Path d="M4 18.5V11a8 8 0 0 1 16 0v7.5a2.5 2.5 0 0 1-2.5 2.5H13" />
          <Rect x="2.75" y="11.5" width="3.75" height="6" rx="1.8" />
          <Rect x="17.5" y="11.5" width="3.75" height="6" rx="1.8" />
        </Svg>
      );
    case 'gift':
      return (
        <Svg {...common}>
          <Rect x="3.75" y="9.5" width="16.5" height="10.75" rx="2" />
          <Line x1="3.75" y1="13.5" x2="20.25" y2="13.5" />
          <Line x1="12" y1="9.5" x2="12" y2="20.25" />
          <Path d="M12 9.5S10.9 3.75 8.4 3.75a2.4 2.4 0 0 0 0 4.8h3.6z" />
          <Path d="M12 9.5s1.1-5.75 3.6-5.75a2.4 2.4 0 0 1 0 4.8H12z" />
        </Svg>
      );
    case 'star':
      return (
        <Svg {...common}>
          <Path d="m12 3.75 2.6 5.4 5.9.85-4.28 4.2 1.02 5.9L12 17.32 6.76 20.1l1.02-5.9L3.5 10l5.9-.85z" />
        </Svg>
      );
    case 'shield':
      return (
        <Svg {...common}>
          <Path d="M12 3.25 19.5 6v6c0 4.4-3.1 7.6-7.5 9-4.4-1.4-7.5-4.6-7.5-9V6z" />
          <Polyline points="9,12 11.25,14.25 15.25,10.25" />
        </Svg>
      );
    case 'download':
      return (
        <Svg {...common}>
          <Line x1="12" y1="3.75" x2="12" y2="15" />
          <Polyline points="7.75,10.75 12,15 16.25,10.75" />
          <Path d="M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
        </Svg>
      );
    case 'arrowUpRight':
      return (
        <Svg {...common} strokeWidth={strokeWidth + 0.2}>
          <Line x1="7" y1="17" x2="17" y2="7" />
          <Polyline points="8.75,7 17,7 17,15.25" />
        </Svg>
      );
    case 'arrowDownLeft':
      return (
        <Svg {...common} strokeWidth={strokeWidth + 0.2}>
          <Line x1="17" y1="7" x2="7" y2="17" />
          <Polyline points="15.25,17 7,17 7,8.75" />
        </Svg>
      );
    case 'wrench':
      return (
        <Svg {...common}>
          <Path d="M15.6 3.9a5.25 5.25 0 0 0-6.4 6.9L3.9 16.1a1.9 1.9 0 0 0 0 2.7l1.3 1.3a1.9 1.9 0 0 0 2.7 0l5.3-5.3a5.25 5.25 0 0 0 6.9-6.4l-3 3-2.5-2.5z" />
        </Svg>
      );
    case 'alert':
      return (
        <Svg {...common}>
          <Path d="M10.6 4.3 2.9 17.4a1.6 1.6 0 0 0 1.4 2.4h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 4.3a1.6 1.6 0 0 0-2.8 0z" />
          <Line x1="12" y1="9.5" x2="12" y2="13.5" />
          <Circle cx="12" cy="16.6" r="1" fill={stroke} stroke="none" />
        </Svg>
      );
    case 'info':
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="8.25" />
          <Line x1="12" y1="11.25" x2="12" y2="16.25" />
          <Circle cx="12" cy="8" r="1" fill={stroke} stroke="none" />
        </Svg>
      );
    case 'eye':
      return (
        <Svg {...common}>
          <Path d="M2.25 12S5.5 5.75 12 5.75 21.75 12 21.75 12 18.5 18.25 12 18.25 2.25 12 2.25 12z" />
          <Circle cx="12" cy="12" r="3" />
        </Svg>
      );
    case 'eyeOff':
      return (
        <Svg {...common}>
          <Path d="M9.5 6.2A9.4 9.4 0 0 1 12 5.75c6.5 0 9.75 6.25 9.75 6.25a17 17 0 0 1-3 3.85" />
          <Path d="M6.6 7.9A16.6 16.6 0 0 0 2.25 12S5.5 18.25 12 18.25a9.5 9.5 0 0 0 3.6-.7" />
          <Line x1="4" y1="4" x2="20" y2="20" />
          <Path d="M10.2 10.4a3 3 0 0 0 4.1 4.1" />
        </Svg>
      );
    case 'logout':
      return (
        <Svg {...common}>
          <Path d="M14.5 4.75h-7a2 2 0 0 0-2 2v10.5a2 2 0 0 0 2 2h7" />
          <Polyline points="16.5,8.5 20.25,12 16.5,15.5" />
          <Line x1="20.25" y1="12" x2="10.5" y2="12" />
        </Svg>
      );
    case 'camera':
      return (
        <Svg {...common}>
          <Path d="M3.5 8.75a2 2 0 0 1 2-2h1.9l1.2-2h6.8l1.2 2h1.9a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
          <Circle cx="12" cy="12.75" r="3.4" />
        </Svg>
      );
    case 'sun':
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="4" />
          <Line x1="12" y1="2.75" x2="12" y2="4.75" />
          <Line x1="12" y1="19.25" x2="12" y2="21.25" />
          <Line x1="4.7" y1="4.7" x2="6.1" y2="6.1" />
          <Line x1="17.9" y1="17.9" x2="19.3" y2="19.3" />
          <Line x1="2.75" y1="12" x2="4.75" y2="12" />
          <Line x1="19.25" y1="12" x2="21.25" y2="12" />
          <Line x1="4.7" y1="19.3" x2="6.1" y2="17.9" />
          <Line x1="17.9" y1="6.1" x2="19.3" y2="4.7" />
        </Svg>
      );
    case 'moon':
      return (
        <Svg {...common}>
          <Path d="M20 14.4A8.5 8.5 0 0 1 9.6 4a8.75 8.75 0 1 0 10.4 10.4z" />
        </Svg>
      );
    case 'phone':
      return (
        <Svg {...common}>
          <Path d="M7.2 3.75 9.5 8.1l-1.9 1.7a12.4 12.4 0 0 0 6.6 6.6l1.7-1.9 4.35 2.3v3.05a1.5 1.5 0 0 1-1.65 1.5C10.9 20.6 3.4 13.1 2.9 5.4A1.5 1.5 0 0 1 4.4 3.75z" />
        </Svg>
      );
    case 'route':
      return (
        <Svg {...common}>
          <Circle cx="6.25" cy="6" r="2.5" />
          <Circle cx="17.75" cy="18" r="2.5" />
          <Path d="M8.75 6h5.5a3.5 3.5 0 0 1 0 7h-4.5a3.5 3.5 0 0 0 0 7h5.5" />
        </Svg>
      );
    case 'megaphone':
      return (
        <Svg {...common}>
          <Path d="M4.5 10.25v3.5a2 2 0 0 0 2 2h1.75l7.5 4.25V4L8.25 8.25H6.5a2 2 0 0 0-2 2z" />
          <Path d="M18.75 9.25a3.4 3.4 0 0 1 0 5.5" />
          <Path d="M8.25 15.75v3.5a1.5 1.5 0 0 0 3 0v-1.8" />
        </Svg>
      );
    case 'compass':
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="8.25" />
          <Path d="m15.25 8.75-1.9 4.6-4.6 1.9 1.9-4.6z" />
        </Svg>
      );
    case 'flag':
      return (
        <Svg {...common}>
          <Line x1="5.5" y1="3.75" x2="5.5" y2="20.5" />
          <Path d="M5.5 5h10.75l-1.6 3.5 1.6 3.5H5.5z" />
        </Svg>
      );
  }
}
