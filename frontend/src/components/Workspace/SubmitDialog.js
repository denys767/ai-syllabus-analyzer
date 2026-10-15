import React from 'react';
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';

const SubmitDialog = ({ open, busy, onClose, onConfirm }) => (
  <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
    <DialogTitle>Надіслати академічному директору?</DialogTitle>
    <DialogContent>
      <Typography variant="body2">
        Директор отримає DOCX і PDF з правками та звіт. Після надсилання рішення в чаті змінити не можна.
      </Typography>
    </DialogContent>
    <DialogActions>
      <Button disabled={busy} onClick={onClose}>Скасувати</Button>
      <Button
        variant="contained"
        disabled={busy}
        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        onClick={onConfirm}
      >
        Надіслати
      </Button>
    </DialogActions>
  </Dialog>
);

export default SubmitDialog;
