import { lightTheme, darkTheme } from '../theme/tokens';

function getThemeVars(theme) {
  const t = theme === 'dark' ? darkTheme : lightTheme;
  return Object.entries(t).reduce((acc, [key, value]) => {
    acc[`--dev-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`] = value;
    return acc;
  }, {});
}

export function DevThemeProvider({ children, theme = 'light' }) {
  const vars = getThemeVars(theme);

  return (
    <div
      style={{
        ...vars,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        minHeight: '100vh',
        background: vars['--dev-bg'],
        color: vars['--dev-text'],
        transition: 'background-color 150ms ease, color 150ms ease',
      }}
    >
      {children}
    </div>
  );
}