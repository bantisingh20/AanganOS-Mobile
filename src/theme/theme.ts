/** Shared design tokens so both apps stay visually consistent (steering: reuse, don't hand-roll). */
export const theme = {
  color: {
    primary: '#05b872',
    primaryDark: '#04a263',
    /** Deep brand tone used for the dashboard hero / headers. */
    hero: '#0b261d',
    heroAlt: '#0f382a',
    primaryText: '#ffffff',
    text: '#0f172a',
    mutedText: '#64748b',
    border: '#e2e8f0',
    danger: '#dc2626',
    warning: '#d97706',
    success: '#05b872',
    info: '#0ea5e9',
    /** App page background (slightly tinted, not pure white, so cards read as elevated). */
    background: '#f4f6f8',
    /** Elevated surface (cards, sheets). */
    surface: '#ffffff',
    /** Subtle fill behind the logo badge / chips. */
    accentSoft: '#ecfdf5',
    /** Translucent white for chips/overlays on the hero. */
    onHeroSoft: 'rgba(255,255,255,0.14)',
    disabled: '#94a3b8',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 6, md: 10, lg: 16, xl: 24, pill: 999 },
  /** Minimum touch target (points) for accessible tap areas (Req 65.6, WCAG 2.5.5). */
  minTouchTarget: 44,
  fontSize: { caption: 12, label: 14, body: 16, title: 20, heading: 24, display: 30 },
  /** Soft elevation shadows (iOS shadow + Android elevation). */
  shadow: {
    card: {
      shadowColor: '#0b1726',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 20,
      elevation: 6,
    },
    soft: {
      shadowColor: '#0b1726',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 3,
    },
    hero: {
      shadowColor: '#0b261d',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.28,
      shadowRadius: 24,
      elevation: 10,
    },
  },
} as const;

export type Theme = typeof theme;
