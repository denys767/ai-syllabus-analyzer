import React from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';

// 409 SUGGESTION_CONFLICT: пропозиція перетинається з уже прийнятими.
const ConflictDialog = ({ open, conflicts = [], busy, error, onKeep, onReplace, onMerge }) => (
  <Dialog open={open} onClose={() => !busy && onKeep()} fullWidth maxWidth="sm">
    <DialogTitle>Конфлікт із прийнятою пропозицією</DialogTitle>
    <DialogContent dividers>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Ця пропозиція змінює той самий текст, що й уже прийняті:
      </Typography>
      <List dense disablePadding sx={{ mb: 1 }}>
        {conflicts.map((item) => (
          <ListItem key={item.suggestionId} disableGutters>
            <ListItemText primary={item.title || 'Без назви'} />
          </ListItem>
        ))}
      </List>
      <Typography variant="body2" color="text.secondary">
        «Замінити попередню» відхилить прийняті пропозиції, а «Об’єднати через AI» підготує новий варіант з
        урахуванням уже прийнятого тексту.
      </Typography>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </DialogContent>
    <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
      <Button disabled={busy} onClick={onKeep}>Залишити попередню</Button>
      <Button disabled={busy} color="warning" onClick={onReplace}>Замінити попередню</Button>
      <Button
        variant="contained"
        disabled={busy}
        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        onClick={onMerge}
      >
        Об’єднати через AI
      </Button>
    </DialogActions>
  </Dialog>
);

export default ConflictDialog;
