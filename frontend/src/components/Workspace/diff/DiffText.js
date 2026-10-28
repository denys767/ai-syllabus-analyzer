import React from 'react';
import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';

// Рендерить parts: [{ type: 'eq' | 'del' | 'ins', text }] в одному рядку.
// del — червоне закреслення, ins — зелений фон; кольори беруться з теми (light/dark).
export function useDiffStyles() {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  return {
    del: {
      bgcolor: alpha(theme.palette.error.main, dark ? 0.28 : 0.14),
      color: dark ? theme.palette.error.light : theme.palette.error.dark,
      textDecoration: 'line-through',
      textDecorationThickness: '1px',
      borderRadius: 0.5,
      px: 0.25,
    },
    ins: {
      bgcolor: alpha(theme.palette.success.main, dark ? 0.3 : 0.18),
      color: dark ? theme.palette.success.light : theme.palette.success.dark,
      borderRadius: 0.5,
      px: 0.25,
    },
  };
}

const DiffText = ({ parts, force, sx }) => {
  const styles = useDiffStyles();
  return (
    <Box
      component="span"
      sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...sx }}
    >
      {(parts || []).map((part, index) => {
        const type = force || part.type;
        return (
          <Box
            // eslint-disable-next-line react/no-array-index-key
            key={`${type}-${index}`}
            component={type === 'del' ? 'del' : type === 'ins' ? 'ins' : 'span'}
            sx={type === 'eq' ? undefined : { ...styles[type], textDecoration: type === 'del' ? 'line-through' : 'none' }}
          >
            {part.text}
          </Box>
        );
      })}
    </Box>
  );
};

export default DiffText;
