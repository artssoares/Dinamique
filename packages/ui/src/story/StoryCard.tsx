import { forwardRef, Fragment } from 'react';
import { Platform } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Image as SvgImage,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import type { LatLng } from '@dinamique/types';
import { blue, coral, neutral } from '../tokens/palette';
import { traceTo } from '../route/geometry';
import { WORDMARK_ASPECT_RATIO, WORDMARK_NEGATIVE_DATA_URI } from './wordmark';
import {
  FIGURE_ROW_Y,
  STORY_FONT_STACK,
  STORY_HEIGHT,
  STORY_MARGIN,
  STORY_TYPE,
  STORY_WIDTH,
  TRACE,
  TRACE_STROKE,
  figureColumnX,
  figureRowFontSize,
} from './storyLayout';

/** Only the web needs telling; native falls back to the system face. */
const FONT = Platform.select({ web: STORY_FONT_STACK, default: undefined });

export interface StoryFigure {
  label: string;
  /** Already formatted. Null renders an em dash and the reason under it. */
  value: string | null;
  /** Shown in place of the value when it is null — never a zero. */
  emptyHint?: string;
}

export interface StoryCardProps {
  /** Already trimmed for sharing by the caller — this component does not cut. */
  points: readonly LatLng[];
  figures: readonly StoryFigure[];
  /** "quinta, 21 de agosto". */
  date: string;
}

/**
 * The image a driver posts.
 *
 * Every prop is a formatted primitive, so this file does no arithmetic and no
 * formatting: it can be rendered from a test, from the app, or from anywhere
 * else without dragging a database or a locale along.
 *
 * Fixed brand colours rather than the theme. The card leaves the phone; it
 * should look the same whichever mode the driver happens to be in, and a
 * light-mode reader opening a dark-mode card is not the effect anybody wants.
 *
 * There is no map underneath, on purpose. One code path on all three
 * platforms, no question about redistributing somebody's tiles, and a card
 * with the brand gradient and a clean trace looks like the Dinamique — where a
 * screenshot of a map looks like a screenshot.
 */
export const StoryCard = forwardRef<Svg, StoryCardProps>(function StoryCard(
  { points, figures, date },
  ref,
) {
  const trace = traceTo(points, TRACE.width, TRACE.height, TRACE.padding);
  const start = trace?.points[0];
  const end = trace?.points[trace.points.length - 1];

  const figureSize = figureRowFontSize(
    figures.map((figure) => figure.value ?? '—'),
    figures.length,
  );

  return (
    <Svg ref={ref} width={STORY_WIDTH} height={STORY_HEIGHT} viewBox={`0 0 ${STORY_WIDTH} ${STORY_HEIGHT}`}>
      <Defs>
        <LinearGradient id="story-bg" x1="0" y1="0" x2="0.4" y2="1">
          <Stop offset="0" stopColor={neutral[950]} />
          <Stop offset="1" stopColor={neutral[900]} />
        </LinearGradient>
        <LinearGradient id="story-route" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={blue[400]} />
          <Stop offset="1" stopColor={coral[400]} />
        </LinearGradient>
      </Defs>

      <Rect x="0" y="0" width={STORY_WIDTH} height={STORY_HEIGHT} fill="url(#story-bg)" />

      {/*
        The real mark, never a typeset stand-in. It is inlined as a data URI
        rather than referenced as an asset because this card gets exported to a
        PNG, and a bundled URL does not resolve inside that export on the web.
      */}
      <SvgImage
        x={STORY_MARGIN}
        y={STORY_MARGIN}
        width={STORY_TYPE.brand * WORDMARK_ASPECT_RATIO}
        height={STORY_TYPE.brand}
        href={{ uri: WORDMARK_NEGATIVE_DATA_URI }}
        preserveAspectRatio="xMinYMin meet"
      />

      <SvgText
        x={STORY_MARGIN}
        y={STORY_MARGIN + STORY_TYPE.brand + 64}
        fill={neutral[400]}
        fontFamily={FONT}
        fontSize={STORY_TYPE.date}
        fontWeight="400"
      >
        {date}
      </SvgText>

      {trace ? (
        <>
          <Path
            d={trace.d}
            transform={`translate(${TRACE.x} ${TRACE.y})`}
            stroke="url(#story-route)"
            strokeWidth={TRACE_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {start ? (
            <Circle
              cx={TRACE.x + start.x}
              cy={TRACE.y + start.y}
              r={TRACE_STROKE}
              fill={neutral[950]}
              stroke={blue[400]}
              strokeWidth={8}
            />
          ) : null}
          {end ? (
            <Circle cx={TRACE.x + end.x} cy={TRACE.y + end.y} r={TRACE_STROKE + 2} fill={coral[400]} />
          ) : null}
        </>
      ) : null}

      {figures.map((figure, index) => {
        const x = figureColumnX(index, figures.length);
        return (
          // A fragment, not a nested <Text>: react-native-svg turns a nested
          // one into a <tspan>, which inherits positioning in ways that differ
          // between the SVG renderers and would place the label by luck.
          <Fragment key={figure.label}>
            <SvgText
              x={x}
              y={FIGURE_ROW_Y}
              fill={neutral[0]}
              fontFamily={FONT}
              fontSize={figureSize}
              fontWeight="700"
              textAnchor="middle"
            >
              {/* An em dash, never a zero. A day without kilometres did not
                  cost R$ 0,00 per kilometre — it has no figure at all (§6). */}
              {figure.value ?? '—'}
            </SvgText>
            <SvgText
              x={x}
              y={FIGURE_ROW_Y + 52}
              fill={neutral[400]}
              fontFamily={FONT}
              fontSize={STORY_TYPE.figureLabel}
              fontWeight="600"
              letterSpacing={2}
              textAnchor="middle"
            >
              {figure.value === null && figure.emptyHint
                ? figure.emptyHint.toUpperCase()
                : figure.label.toUpperCase()}
            </SvgText>
          </Fragment>
        );
      })}

      <SvgText
        x={STORY_WIDTH / 2}
        y={STORY_HEIGHT - STORY_MARGIN}
        fill={neutral[500]}
        fontFamily={FONT}
        fontSize={STORY_TYPE.footer}
        textAnchor="middle"
      >
        dinamique.com.br
      </SvgText>
    </Svg>
  );
});
