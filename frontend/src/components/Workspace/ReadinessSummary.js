import React from 'react';
import { Box, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import { GROUP_KEYS, GROUP_LABELS } from './constants';

const scoreLabel = (score) => (score >= 100
  ? 'Готово до надсилання'
  : score >= 75 ? 'Майже готово' : score >= 50 ? 'Робота триває' : 'Потрібне доопрацювання');

const ReadinessSummary = ({ readiness }) => {
  const score = Math.round(readiness?.score ?? 0);
  const breakdown = readiness?.breakdown || {};
  const counts = readiness?.counts || { pending: 0, accepted: 0, rejected: 0, total: 0 };
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
        <Typography variant="subtitle2">Готовність · {score}%</Typography>
        {score >= 100 && counts.total > 0 && <Chip label="Готово" size="small" color="success" />}
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.max(0, Math.min(100, score))}
        color={score >= 100 ? 'success' : score >= 50 ? 'primary' : 'warning'}
        sx={{ height: 8, borderRadius: 4 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, mb: 1.5 }}>
        {scoreLabel(score)}
      </Typography>

      <Stack spacing={0.75} sx={{ mb: 1.5 }}>
        {GROUP_KEYS.map((key) => {
          const value = Math.round(breakdown[key] ?? 0);
          return (
            <Box key={key}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption">{GROUP_LABELS[key]}</Typography>
                <Typography variant="caption" color="text.secondary">{value}%</Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.max(0, Math.min(100, value))}
                color={value >= 100 ? 'success' : 'primary'}
                sx={{ height: 4, borderRadius: 2 }}
              />
            </Box>
          );
        })}
      </Stack>

      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
        <Chip size="small" variant="outlined" label={`Очікують: ${counts.pending}`} />
        <Chip size="small" variant="outlined" color="success" label={`Прийнято: ${counts.accepted}`} />
        <Chip size="small" variant="outlined" label={`Відхилено: ${counts.rejected}`} />
        <Chip size="small" variant="outlined" label={`Усього: ${counts.total}`} />
      </Stack>
    </Box>
  );
};

export default ReadinessSummary;
