import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DiffText from './DiffText';
import { BLOCK_KIND_LABELS } from '../constants';

const HEADING_SIZE = { 1: '1.2rem', 2: '1.08rem' };

const STATUS_CHIP = {
  inserted: { label: 'Додано', color: 'success' },
  deleted: { label: 'Видалено', color: 'error' },
};

// Один блок документа: тип (заголовок/пункт/клітинка), стан (додано/видалено/змінено), diff усередині.
const BlockView = ({ kind = 'paragraph', level, status = 'unchanged', parts, showLabel = true, sx }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const whole = status === 'inserted' ? 'ins' : status === 'deleted' ? 'del' : undefined;
  const tint = status === 'inserted' ? 'success' : status === 'deleted' ? 'error' : null;
  const label = BLOCK_KIND_LABELS[kind];
  const chip = STATUS_CHIP[status];

  return (
    <Box
      data-block-status={status}
      sx={{
        position: 'relative',
        p: tint || kind === 'table-cell' ? 1 : 0.5,
        pl: kind === 'list-item' ? 3 : undefined,
        borderRadius: 1,
        border: kind === 'table-cell' || tint ? '1px solid' : 'none',
        borderColor: tint ? `${tint}.main` : 'divider',
        borderLeftWidth: tint ? 3 : undefined,
        bgcolor: tint ? alpha(theme.palette[tint].main, dark ? 0.14 : 0.08) : 'transparent',
        ...sx,
      }}
    >
      {(chip || (showLabel && label)) && (
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mb: 0.5 }}>
          {chip && <Chip size="small" color={chip.color} label={chip.label} sx={{ height: 20, fontSize: '0.7rem' }} />}
          {showLabel && label && (
            <Typography variant="caption" color="text.secondary">{label}</Typography>
          )}
        </Box>
      )}
      {kind === 'list-item' && (
        <Box component="span" aria-hidden sx={{ position: 'absolute', left: 12, top: tint ? 8 : 4 }}>•</Box>
      )}
      <Typography
        component="div"
        variant="body2"
        sx={{
          lineHeight: 1.6,
          fontWeight: kind === 'heading' || kind === 'slide-title' ? 700 : 400,
          fontSize: kind === 'heading' ? (HEADING_SIZE[level] || '1rem') : undefined,
        }}
      >
        <DiffText parts={parts} force={whole} />
      </Typography>
    </Box>
  );
};

export default BlockView;
