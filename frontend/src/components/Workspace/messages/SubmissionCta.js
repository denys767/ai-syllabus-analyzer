import React from 'react';
import { Button, Chip, Stack, Typography } from '@mui/material';
import { Send, Visibility } from '@mui/icons-material';
import Bubble from './Bubble';
import MarkdownText from './MarkdownText';

const SubmissionCta = ({ message, pendingCount = 0, submitted = false, busy, onPreview, onSubmit }) => (
  <Bubble role="ai" sx={{ maxWidth: '95%' }}>
    {message?.content && <MarkdownText sx={{ mb: 1.5 }}>{message.content}</MarkdownText>}
    {submitted ? (
      <Chip color="success" label="Надіслано академічному директору" />
    ) : (
      <>
        {pendingCount > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Залишилось опрацювати пропозицій: {pendingCount}.
          </Typography>
        )}
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button variant="outlined" size="small" startIcon={<Visibility />} disabled={busy} onClick={onPreview}>
            Переглянути документ
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<Send />}
            disabled={busy || pendingCount > 0}
            onClick={onSubmit}
          >
            Надіслати директору
          </Button>
        </Stack>
      </>
    )}
  </Bubble>
);

export default SubmissionCta;
