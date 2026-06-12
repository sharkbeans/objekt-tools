export const ToploaderConfig = {
  dimensions: { sideOverlap: 61.8, bottomOverlap: 139.23 },
  corners: { topRadius: 70, bottomRadius: 42 },
  frame: { leftThickness: 10, rightThickness: 9, rightInset: 1 },
  borders: {
    west: {
      widthMultiplier: 3,
      scaleFactor: 1.2,
      startOpacity: 0.7,
      endOpacity: 0.4,
    },
    east: {
      widthMultiplier: 3,
      scaleFactor: 1.2,
      startOpacity: 0.7,
      endOpacity: 0.4,
    },
    south: { edgeOpacity: 0.5, centerOpacity: 0.7 },
  },
  overlay: {
    baseOpacity: 0.03,
    innerTint: { red: 240, green: 245, blue: 255, opacity: 0.05 },
    innerEdge: {
      red: 180,
      green: 190,
      blue: 210,
      opacity: 0.12,
      lineWidth: 0.8,
    },
  },
  highlights: {
    top: {
      heightPercent: 0.3,
      startOpacity: 0.07,
      middleOpacity: 0.02,
      endOpacity: 0,
    },
  },
  shadows: {
    north: { startOpacity: 0.1, endOpacity: 0 },
    west: { startOpacity: 0.18, endOpacity: 0 },
    east: { startOpacity: 0.18, endOpacity: 0 },
    south: { startOpacity: 0, endOpacity: 0.18 },
  },
  shadingLine: {
    red: 140,
    green: 140,
    blue: 140,
    opacity: 0.45,
    widthReduction: 0.4,
  },
  clipping: { topClip: 5 },
  curves: { topCurveStartPercent: 0.6 },
  glazeFilm: { red: 255, green: 255, blue: 255, opacity: 0.02 },
  photocardInset: {
    sideGap: 8,
    topGap: 8,
    bottomGap: 14,
    recessShadow: { blur: 22, offsetY: 4, opacity: 0.35 },
  },
  glossStreak: {
    angle: -22,
    widthFraction: 0.32,
    position: 0.35,
    peakOpacity: 0.045,
    secondary: { widthFraction: 0.12, position: 0.62, peakOpacity: 0.0225 },
  },
  innerVignette: { cornerOpacity: 0.18, centerOpacity: 0 },
} as const;

export type ToploaderConfigType = typeof ToploaderConfig;
