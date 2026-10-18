/**
 * Kite Design Tokens & Theme Constants
 * Centralized design system variables for colors, typography, border radius, and dividers.
 * Edit here to update the look and feel across the entire app.
 */

export const theme = {
  colors: {
    // Backgrounds
    background: '#ffffff',
    backgroundSecondary: '#f4f4f5',
    backdrop: 'rgba(0, 0, 0, 0.45)',

    // Surface & Cards
    surface: '#ffffff',
    card: '#ffffff',
    cardSecondary: '#f4f4f5',

    // Bottom Sheet Surface & Cards ("xanh xanh xám xám tí" - cool slate blue-gray)
    sheetBackground: '#f0f4f8',
    sheetCard: '#ffffff',

    // Text
    textPrimary: '#09090b',
    textSecondary: '#71717a',
    textMuted: '#a1a1aa',
    textWhite: '#ffffff',

    // Borders & Dividers
    border: '#e4e4e7',
    borderLight: '#f4f4f5',
    divider: '#e4e4e7', // Visible, elegant 1px horizontal divider
    dragHandle: '#d4d4d8',

    // Monochrome Accents
    black: '#18181b',
    white: '#ffffff',
    grayDark: '#27272a',
    grayMedium: '#52525b',
    grayLight: '#71717a',
    graySubtle: '#e4e4e7',
    grayBackground: '#f4f4f5',

    // Primary Accents & Active States (Blue)
    accentBlue: '#007aff',

    // Switch Tracks
    switchTrackFalse: '#e4e4e7',
    switchTrackTrue: '#007aff',
    switchThumb: '#ffffff',
  },
  typography: {
    fontSize: {
      xs: 11,
      sm: 12,
      md: 13,
      base: 14,
      menuTitle: 16,
      lg: 16,
      xl: 18,
      xxl: 20,
    },
    fontWeight: {
      regular: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
    },
  },
  radius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 18,
    xl: 24,
    xxl: 26,
    sheet: 32,
    full: 9999,
  },
  divider: {
    height: 1,
    backgroundColor: '#e4e4e7',
  },
} as const;

export default theme;
