import React from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const MetricsRow = ({ metrics }) => (
  <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ mb: 3 }}>
    {[
      { label: 'Total', value: metrics?.total ?? '—' },
      { label: '100% ready', value: metrics?.ready100 ?? '—', color: 'primary.main' },
      { label: 'Downloads', value: metrics?.downloads ?? '—' },
      { label: 'In progress', value: metrics?.inProgress ?? '—', color: 'warning.main' },
    ].map(({ label, value, color }) => (
      <Paper key={label} variant="outlined" sx={{ px: 3, py: 1.5, minWidth: 120, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ color: color || 'text.primary' }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
      </Paper>
    ))}
  </Stack>
);

export default MetricsRow;
