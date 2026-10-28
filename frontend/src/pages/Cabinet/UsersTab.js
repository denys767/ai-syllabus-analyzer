import React, { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Add from '@mui/icons-material/Add';
import api from '../../services/api';

const EMPTY_FORM = { email: '', firstName: '', lastName: '', role: 'instructor' };

const roleLabels = { instructor: "Instructor", admin: "Administrator" };

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
      setSnack("Could not load users");
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
      setSnack("User created and invitation sent");
      load();
    } catch (err) {
      setSnack(err.response?.data?.message || "Could not create the user");
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
      setSnack(err.response?.data?.message || "Could not update the user");
    } finally {
      setUpdatingId('');
    }
  };

  return (
    <Box>
      <Stack direction="row" sx={{ mb: 2 }}>
        <Button startIcon={<Add />} variant="contained" size="small" onClick={() => setOpen(true)}>Create user</Button>
      </Stack>
      {loading && <CircularProgress size={20} sx={{ mb: 2 }} />}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>First name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Active</TableCell>
              <TableCell>Created</TableCell>
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
                    inputProps={{ 'aria-label': `Account active: ${u.email}` }}
                  />
                </TableCell>
                <TableCell>{new Date(u.createdAt).toLocaleDateString('en-GB')}</TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>No users found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Email" size="small" fullWidth value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <TextField label="First name" size="small" fullWidth value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
            <TextField label="Last name" size="small" fullWidth value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
            <Select size="small" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <MenuItem value="instructor">{roleLabels.instructor}</MenuItem>
              <MenuItem value="admin">{roleLabels.admin}</MenuItem>
            </Select>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={createUser} disabled={saving || !form.email || !form.firstName || !form.lastName}>
            {saving ? <CircularProgress size={18} /> : "Create and invite"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
};

export default UsersTab;
