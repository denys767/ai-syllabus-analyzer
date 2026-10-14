import React from 'react';
import { Paper, Stack, Typography } from '@mui/material';

const MetricsRow = ({ metrics }) => (
  <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
    {[
      { label: 'Усього', value: metrics?.total ?? '—' },
      { label: 'Надіслано', value: metrics?.submitted ?? '—', color: 'success.main' },
      { label: 'У роботі', value: metrics?.inProgress ?? '—', color: 'warning.main' },
    ].map(({ label, value, color }) => (
      <Paper key={label} variant="outlined" sx={{ px: 3, py: 1.5, minWidth: 120, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ color: color || 'text.primary' }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
      </Paper>
    ))}
  </Stack>
);

export default MetricsRow;
