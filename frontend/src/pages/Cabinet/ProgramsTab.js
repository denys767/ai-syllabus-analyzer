import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
} from '@mui/material';
import { Add, Delete, Edit } from '@mui/icons-material';
import api from '../../services/api';

const ProgramsTab = ({ programs, reload }) => {
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', academicDirectorEmail: '' });
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState('');

  const openCreate = () => { setForm({ name: '', code: '', academicDirectorEmail: '' }); setCreating(true); };
  const openEdit = (p) => { setEditing(p._id); setForm({ name: p.name, code: p.code, academicDirectorEmail: p.academicDirectorEmail || '' }); };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api.cabinet.updateProgram(editing, { name: form.name, academicDirectorEmail: form.academicDirectorEmail });
      } else {
        await api.cabinet.createProgram(form);
      }
      setEditing(null);
      setCreating(false);
      setSnack(editing ? 'Програму оновлено' : 'Програму створено');
      reload();
    } catch (err) {
      setSnack(err.response?.data?.message || 'Не вдалося зберегти');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm('Видалити цю програму?')) return;
    try {
      await api.cabinet.deleteProgram(id);
      setSnack('Видалено');
      reload();
    } catch (err) {
      setSnack(err.response?.data?.message || 'Не вдалося видалити');
    }
  };

  const isOpen = creating || !!editing;

  return (
    <Box>
      <Stack direction="row" sx={{ mb: 2 }}>
        <Button startIcon={<Add />} variant="contained" size="small" onClick={openCreate}>Додати програму</Button>
      </Stack>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Код</TableCell>
              <TableCell>Назва</TableCell>
              <TableCell>Email академічного директора</TableCell>
              <TableCell align="right">Дії</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {programs.map((p) => (
              <TableRow key={p._id} hover>
                <TableCell><Chip label={p.code} size="small" variant="outlined" /></TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell>{p.academicDirectorEmail || '—'}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Редагувати"><IconButton size="small" onClick={() => openEdit(p)}><Edit fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Видалити"><IconButton size="small" color="error" onClick={() => del(p._id)}><Delete fontSize="small" /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {programs.length === 0 && (
              <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>Програм немає</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={isOpen} onClose={() => { setCreating(false); setEditing(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? 'Редагувати програму' : 'Додати програму'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!editing && (
              <TextField label="Код (напр., MBA)" size="small" fullWidth value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
            )}
            <TextField label="Назва" size="small" fullWidth value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField label="Email академічного директора" size="small" fullWidth value={form.academicDirectorEmail}
              onChange={(e) => setForm((f) => ({ ...f, academicDirectorEmail: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCreating(false); setEditing(null); }}>Скасувати</Button>
          <Button variant="contained" onClick={save} disabled={saving || !form.name || (!editing && !form.code)}>
            {saving ? <CircularProgress size={18} /> : 'Зберегти'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
};

export default ProgramsTab;
