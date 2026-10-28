import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider, createTheme, alpha } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useAuth } from './AuthContext';
import api from '../services/api';

const ThemeModeContext = createContext();

// Дизайн-токени в одному місці. Точні значення прийдуть з Layout-референсу — міняти лише тут.
// Три кольори: primary (бренд KSE), neutral (текст, рамки, фони), accent (proposedValues і warning).
export const TOKENS = {
  color: {
    primary: { main: '#00665a', light: '#33998a', dark: '#004d43', contrastText: '#ffffff' },
    neutral: {
      light: { bg: '#f7f8f7', paper: '#ffffff', text: '#1d2523', textSecondary: '#5b6663', border: '#e2e6e4' },
      dark: { bg: '#0f1312', paper: '#181d1c', text: 'rgba(255,255,255,0.92)', textSecondary: 'rgba(255,255,255,0.66)', border: '#2a312f' },
    },
    accent: { main: '#c77700', light: '#f0a63a', dark: '#8f5600', contrastText: '#ffffff' },
  },
  radius: { base: 12, card: 16, dialog: 20, pill: 999 },
};

export function buildTheme(mode = 'light') {
  const isDark = mode === 'dark';
  const n = TOKENS.color.neutral[isDark ? 'dark' : 'light'];
  const { primary, accent } = TOKENS.color;
  const { radius } = TOKENS;
  return createTheme({
    palette: {
      mode,
      primary,
      // Системні статуси теж використовують primary або accent: у палітрі три кольори.
      secondary: accent,
      warning: accent,
      info: primary,
      success: primary,
      error: accent,
      accent,
      background: { default: n.bg, paper: n.paper },
      text: { primary: n.text, secondary: n.textSecondary },
      divider: n.border,
    },
    shape: { borderRadius: radius.base },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: radius.pill, textTransform: 'none', fontWeight: 600 } },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: radius.pill } } },
      MuiPaper: { styleOverrides: { rounded: { borderRadius: radius.card } } },
      MuiCard: { styleOverrides: { root: { borderRadius: radius.card } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: radius.dialog } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: radius.base } } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: radius.base } } },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: radius.base,
            margin: '4px 8px',
            '&.Mui-selected': {
              backgroundColor: alpha(primary.main, isDark ? 0.24 : 0.1),
              color: isDark ? primary.light : primary.main,
              '&:hover': { backgroundColor: alpha(primary.main, isDark ? 0.32 : 0.16) },
            },
          },
        },
      },
    },
  });
}

export const ThemeModeProvider = ({ children }) => {
  const { user } = useAuth();
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setModeState] = useState('system');

  useEffect(() => {
    if (user?.settings?.theme) setModeState(user.settings.theme);
  }, [user]);

  const setMode = async (newMode) => {
    setModeState(newMode);
    // Зберігаємо вибір на сервері; при помилці локальний стан не відкочуємо
    if (user) {
      try {
        await api.user.updateSettings({ theme: newMode });
      } catch (error) {
        console.error('Failed to save theme preference:', error);
      }
    }
  };

  const resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
  const theme = useMemo(() => buildTheme(resolved), [resolved]);

  return (
    <ThemeModeContext.Provider value={{ mode, setMode }}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ThemeModeContext.Provider>
  );
};

export const useThemeMode = () => useContext(ThemeModeContext);
