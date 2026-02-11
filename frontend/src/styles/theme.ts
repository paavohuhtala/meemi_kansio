export const theme = {
  colors: {
    bg: '#0f0f0f',
    surface: '#1a1a1a',
    surfaceHover: '#252525',
    border: '#333333',
    text: '#e0e0e0',
    textSecondary: '#888888',
    primary: '#6366f1',
    primaryHover: '#818cf8',
    error: '#ef4444',
    errorHover: '#dc2626',
    success: '#22c55e',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
  },
  fontSize: {
    sm: '0.875rem',
    md: '1rem',
    lg: '1.25rem',
    xl: '1.5rem',
    xxl: '2rem',
  },
} as const;

export type Theme = typeof theme;

const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export const media = {
  sm: `@media (min-width: ${breakpoints.sm}px)`,
  md: `@media (min-width: ${breakpoints.md}px)`,
  lg: `@media (min-width: ${breakpoints.lg}px)`,
  xl: `@media (min-width: ${breakpoints.xl}px)`,
} as const;
