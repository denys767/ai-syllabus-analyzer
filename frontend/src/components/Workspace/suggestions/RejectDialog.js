import React, { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { REJECT_TAGS, S } from '../../../strings';

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
      <DialogTitle>{S.cancelTitle}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {requiresReason ? S.cancelReasonRequired : S.cancelReasonOptional}
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
          label={requiresReason ? S.reasonRequired : S.reason}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          required={requiresReason}
        />
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>{S.back}</Button>
        <Button variant="contained" color="primary" disabled={!canSubmit} onClick={submit}>
          {S.cancelTitle}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RejectDialog;
