import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Add from '@mui/icons-material/Add';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
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
      setSnack(editing ? "Programme updated" : "Programme created");
      reload();
    } catch (err) {
      setSnack(err.response?.data?.message || "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this programme?")) return;
    try {
      await api.cabinet.deleteProgram(id);
      setSnack("Deleted");
      reload();
    } catch (err) {
      setSnack(err.response?.data?.message || "Could not delete");
    }
  };

  const isOpen = creating || !!editing;

  return (
    <Box>
      <Stack direction="row" sx={{ mb: 2 }}>
        <Button startIcon={<Add />} variant="contained" size="small" onClick={openCreate}>Add programme</Button>
      </Stack>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Academic director email</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {programs.map((p) => (
              <TableRow key={p._id} hover>
                <TableCell><Chip label={p.code} size="small" variant="outlined" /></TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell>{p.academicDirectorEmail || '—'}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(p)}><Edit fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => del(p._id)}><Delete fontSize="small" /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {programs.length === 0 && (
              <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>No programmes yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={isOpen} onClose={() => { setCreating(false); setEditing(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? "Edit programme" : "Add programme"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!editing && (
              <TextField label="Code (e.g. MBA)" size="small" fullWidth value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
            )}
            <TextField label="Title" size="small" fullWidth value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField label="Academic director email" size="small" fullWidth value={form.academicDirectorEmail}
              onChange={(e) => setForm((f) => ({ ...f, academicDirectorEmail: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCreating(false); setEditing(null); }}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving || !form.name || (!editing && !form.code)}>
            {saving ? <CircularProgress size={18} /> : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
};

export default ProgramsTab;
