import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { Add } from '@mui/icons-material';
import api from '../../services/api';

const EMPTY_FORM = { email: '', firstName: '', lastName: '', role: 'instructor' };

const roleLabels = { instructor: 'Викладач', admin: 'Адміністратор' };

const UsersTab = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState('');
  const [snack, setSnack] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.cabinet.getUsers({ limit: 100 });
      setRows(data.users || []);
    } catch {
      setSnack('Не вдалося завантажити користувачів');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createUser = async () => {
    setSaving(true);
    try {
      await api.cabinet.createUser(form);
      setOpen(false);
      setForm(EMPTY_FORM);
      setSnack('Користувача створено, запрошення надіслано');
      load();
    } catch (err) {
      setSnack(err.response?.data?.message || 'Не вдалося створити користувача');
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async (id, patch) => {
    setUpdatingId(id);
    try {
      const { data } = await api.cabinet.updateUser(id, patch);
      setRows((prev) => prev.map((u) => (u._id === id ? { ...u, ...data.user } : u)));
    } catch (err) {
      setSnack(err.response?.data?.message || 'Не вдалося оновити користувача');
    } finally {
      setUpdatingId('');
    }
  };

  return (
    <Box>
      <Stack direction="row" sx={{ mb: 2 }}>
        <Button startIcon={<Add />} variant="contained" size="small" onClick={() => setOpen(true)}>Створити користувача</Button>
      </Stack>
      {loading && <CircularProgress size={20} sx={{ mb: 2 }} />}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Ім’я</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Роль</TableCell>
              <TableCell>Активний</TableCell>
              <TableCell>Дата створення</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u._id} hover>
                <TableCell>{`${u.firstName} ${u.lastName}`}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Select
                    size="small"
                    variant="standard"
                    value={u.role}
                    disabled={updatingId === u._id}
                    onChange={(e) => updateUser(u._id, { role: e.target.value })}
                  >
                    <MenuItem value="instructor">{roleLabels.instructor}</MenuItem>
                    <MenuItem value="admin">{roleLabels.admin}</MenuItem>
                  </Select>
                </TableCell>
                <TableCell>
                  <Switch
                    size="small"
                    checked={u.isActive !== false}
                    disabled={updatingId === u._id}
                    onChange={(e) => updateUser(u._id, { isActive: e.target.checked })}
                    inputProps={{ 'aria-label': `Активність ${u.email}` }}
                  />
                </TableCell>
                <TableCell>{new Date(u.createdAt).toLocaleDateString('uk-UA')}</TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>Користувачів не знайдено</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Створити користувача</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Email" size="small" fullWidth value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <TextField label="Ім’я" size="small" fullWidth value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
            <TextField label="Прізвище" size="small" fullWidth value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
            <Select size="small" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <MenuItem value="instructor">{roleLabels.instructor}</MenuItem>
              <MenuItem value="admin">{roleLabels.admin}</MenuItem>
            </Select>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Скасувати</Button>
          <Button variant="contained" onClick={createUser} disabled={saving || !form.email || !form.firstName || !form.lastName}>
            {saving ? <CircularProgress size={18} /> : 'Створити й запросити'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
};

export default UsersTab;
