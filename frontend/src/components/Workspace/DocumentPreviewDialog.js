import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import BlockView from './diff/BlockView';

// Весь документ з прийнятими змінами. Перемикач «лише змінені блоки» ховає незмінені.
const DocumentPreviewDialog = ({ open, loading, blocks, error, onClose }) => {
  const [onlyChanged, setOnlyChanged] = useState(false);
  const visible = (blocks || []).filter((b) => !onlyChanged || b.status !== 'unchanged');
  const changedCount = (blocks || []).filter((b) => b.status && b.status !== 'unchanged').length;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <span>Перегляд документа</span>
          <FormControlLabel
            control={<Switch size="small" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />}
            label={<Typography variant="body2">Лише змінені блоки</Typography>}
          />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading && !error && blocks && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Змінених блоків: {changedCount} з {blocks.length}
            </Typography>
            <Stack spacing={0.75}>
              {visible.map((block, index) => (
                <BlockView
                  key={`${block.blockId}-${index}`}
                  kind={block.kind}
                  level={block.level}
                  status={block.status}
                  parts={block.parts}
                  showLabel={block.kind !== 'paragraph'}
                />
              ))}
              {!visible.length && (
                <Typography variant="body2" color="text.secondary">
                  {onlyChanged ? 'Прийнятих змін поки немає.' : 'Документ порожній.'}
                </Typography>
              )}
            </Stack>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрити</Button>
      </DialogActions>
    </Dialog>
  );
};

export default DocumentPreviewDialog;
