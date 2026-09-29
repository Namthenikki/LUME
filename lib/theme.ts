export const THEME_COOKIE = 'lume_theme';
export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

/** Light unless the owner picked otherwise in Settings, to match the landing page. */
export function parseTheme(value: string | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : 'light';
}
