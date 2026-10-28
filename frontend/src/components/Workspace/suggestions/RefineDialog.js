import React, { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { REFINE_HINTS, S } from '../../../strings';

const RefineDialog = ({ open, busy, error, onClose, onSubmit }) => {
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (open) setFeedback('');
  }, [open]);

  const appendHint = (hint) => {
    setFeedback((current) => (current.trim() ? `${current.trim()}, ${hint.toLowerCase()}` : hint));
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>{S.rewordTitle}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {S.rewordHint}
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
          {REFINE_HINTS.map((hint) => (
            <Chip key={hint} label={hint} size="small" variant="outlined" clickable disabled={busy} onClick={() => appendHint(hint)} />
          ))}
        </Stack>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          label={S.comment}
          placeholder={S.rewordPlaceholder}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          disabled={busy}
        />
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>{S.back}</Button>
        <Button
          variant="contained"
          disabled={busy || !feedback.trim()}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          onClick={() => onSubmit({ feedback: feedback.trim() })}
        >
          {busy ? S.rewording : S.updateDraft}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RefineDialog;
