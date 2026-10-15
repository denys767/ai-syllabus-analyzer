import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { REJECT_TAGS } from '../constants';

const RejectDialog = ({ open, requiresReason, busy, error, onClose, onSubmit }) => {
  const [reason, setReason] = useState('');
  const [tag, setTag] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
      setTag('');
    }
  }, [open]);

  const trimmed = reason.trim();
  const canSubmit = !busy && (!requiresReason || trimmed.length > 0);

  const submit = () => {
    const body = {};
    if (trimmed) body.reason = trimmed;
    if (tag) body.rejectTag = tag;
    onSubmit(body);
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>Відхилити пропозицію</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {requiresReason
            ? 'Критичні та важливі пропозиції можна відхилити лише з причиною — вона потрапить у звіт для академічного директора.'
            : 'Причина необов’язкова, але допомагає покращити наступні пропозиції.'}
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
          {REJECT_TAGS.map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              clickable
              color={tag === item.value ? 'primary' : 'default'}
              variant={tag === item.value ? 'filled' : 'outlined'}
              onClick={() => setTag(tag === item.value ? '' : item.value)}
            />
          ))}
        </Stack>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          label={requiresReason ? 'Причина (обов’язково)' : 'Причина'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          required={requiresReason}
        />
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>Назад</Button>
        <Button variant="contained" color="warning" disabled={!canSubmit} onClick={submit}>
          Відхилити
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RejectDialog;
