import React from 'react';
import { CircularProgress, Stack, Typography } from '@mui/material';
import Bubble from './Bubble';

const PendingReply = () => (
  <Bubble role="ai">
    <Stack direction="row" spacing={1} alignItems="center">
      <CircularProgress size={16} />
      <Typography variant="body2" color="text.secondary">Думаю…</Typography>
    </Stack>
  </Bubble>
);

export default PendingReply;
