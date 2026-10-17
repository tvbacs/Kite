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

    // Switch Tracks
    switchTrackFalse: '#e4e4e7',
    switchTrackTrue: '#18181b',
    switchThumb: '#ffffff',
  },
  typography: {
    fontSize: {
      xs: 11,
      sm: 12,
      md: 13,
      base: 14,
      menuTitle: 15,
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
    md: 10,
    lg: 14,
    xl: 16,
    xxl: 20,
    sheet: 26,
    full: 9999,
  },
  divider: {
    height: 1,
    backgroundColor: '#e4e4e7',
  },
} as const;

export default theme;
