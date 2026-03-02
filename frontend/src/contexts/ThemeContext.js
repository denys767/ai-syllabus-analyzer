import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useAuth } from './AuthContext';
import api from '../services/api';

const ThemeModeContext = createContext();

const base = {
  palette: {
    primary: { main: '#00665a', light: '#33998a', dark: '#004d43', contrastText: '#ffffff' },
    secondary: { main: '#9c27b0', light: '#ba68c8', dark: '#7b1fa2', contrastText: '#ffffff' },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '4px 8px',
          '&.Mui-selected': {
            backgroundColor: '#e6f4f2',
            color: '#00665a',
            '&:hover': { backgroundColor: '#cce8e5' },
          },
        },
      },
    },
  },
};

export const ThemeModeProvider = ({ children }) => {
  const { user } = useAuth();
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setModeState] = useState('system');

  useEffect(() => {
    if (user?.settings?.theme) setModeState(user.settings.theme);
  }, [user]);

  const setMode = async (newMode) => {
    setModeState(newMode);
    
    // Save theme preference to backend if user is authenticated
    if (user) {
      try {
        await api.user.updateSettings({ theme: newMode });
      } catch (error) {
        console.error('Failed to save theme preference:', error);
        // Don't revert the local state on error to avoid jarring UX
      }
    }
  };

  const resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;

  const theme = useMemo(() => {
    const isDark = resolved === 'dark';
    return createTheme({
      ...base,
      palette: {
        ...base.palette,
        mode: resolved,
        background: {
          default: isDark ? '#0a0a0a' : '#f8fafc',
          paper: isDark ? '#1a1a1a' : '#ffffff',
        },
        text: {
          primary: isDark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.87)',
          secondary: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
        },
      },
    });
  }, [resolved]);

  return (
    <ThemeModeContext.Provider value={{ mode, setMode }}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ThemeModeContext.Provider>
  );
};

export const useThemeMode = () => useContext(ThemeModeContext);
