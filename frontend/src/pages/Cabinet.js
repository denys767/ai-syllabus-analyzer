import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  Chat,
  Delete,
  Edit,
  Email,
  Refresh,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

// ─── Metrics row ─────────────────────────────────────────────────────────────

const MetricsRow = ({ metrics }) => (
  <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
    {[
      { label: 'Total', value: metrics?.total ?? '—' },
      { label: 'Submitted', value: metrics?.submitted ?? '—', color: 'success.main' },
      { label: 'In Progress', value: metrics?.inProgress ?? '—', color: 'warning.main' },
    ].map(({ label, value, color }) => (
      <Paper key={label} variant="outlined" sx={{ px: 3, py: 1.5, minWidth: 120, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ color: color || 'text.primary' }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
      </Paper>
    ))}
  </Stack>
);

// ─── Status chip ──────────────────────────────────────────────────────────────

const statusColor = { submitted: 'success', in_progress: 'warning', analyzing: 'default', error: 'error' };
const statusLabel = { submitted: 'Submitted', in_progress: 'In progress', analyzing: 'Draft', error: 'Error' };
const StatusChip = ({ status }) => (
  <Chip label={statusLabel[status] || 'Draft'} size="small" color={statusColor[status] || 'default'} />
);

const ReadinessCell = ({ syllabus }) => {
  const score = Number(syllabus.readiness?.score || 0);
  const blockers = Number(syllabus.issueCounts?.blockers || 0);
  return (
    <Box sx={{ minWidth: 130 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{score}%</Typography>
        {blockers > 0 && <Chip size="small" color="error" label={`${blockers} blocker${blockers === 1 ? '' : 's'}`} />}
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.max(0, Math.min(100, score))}
        color={blockers > 0 ? 'error' : score >= 100 ? 'success' : 'primary'}
        sx={{ height: 6, borderRadius: 1 }}
      />
    </Box>
  );
};

// ─── Syllabi tab ─────────────────────────────────────────────────────────────

const SyllabiTab = ({ programs, onChanged }) => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [program, setProgram] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [snack, setSnack] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.cabinet.getSyllabi({ program, status, page, limit: 20 });
      setRows(data.syllabi || []);
      setTotal(data.total || 0);
    } catch (err) {
      setSnack(err.response?.data?.message || 'Failed to load syllabi');
    } finally {
      setLoading(false);
    }
  }, [program, status, page]);

  useEffect(() => { load(); }, [load]);

  const resend = async (id) => {
    try {
      await api.cabinet.resendSubmission(id);
      setSnack('Email resent');
      load();
    } catch (err) {
      setSnack(err.response?.data?.message || 'Resend failed');
    }
  };

  const deleteSyllabus = async (syllabus) => {
    const courseTitle = syllabus.course?.name || syllabus.title || 'this syllabus';
    if (!window.confirm(`Delete "${courseTitle}"? This cannot be undone.`)) return;

    setDeletingId(syllabus._id);
    try {
      await api.cabinet.deleteSyllabus(syllabus._id);
      setSnack('Syllabus deleted');
      onChanged?.();
      if (rows.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        load();
      }
    } catch (err) {
      setSnack(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
        <Select size="small" value={program} onChange={(e) => { setProgram(e.target.value); setPage(1); }} displayEmpty sx={{ minWidth: 160 }}>
          <MenuItem value="">All programs</MenuItem>
          {programs.map((p) => <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>)}
        </Select>
        <Select size="small" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} displayEmpty sx={{ minWidth: 140 }}>
          <MenuItem value="">All statuses</MenuItem>
          {['analyzing', 'in_progress', 'submitted', 'error'].map((s) => <MenuItem key={s} value={s}>{statusLabel[s] || s}</MenuItem>)}
        </Select>
        <IconButton onClick={load} disabled={loading}><Refresh /></IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>{total} total</Typography>
      </Stack>
      {loading && <CircularProgress size={20} sx={{ mb: 2 }} />}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Course</TableCell>
              <TableCell>Instructor</TableCell>
              <TableCell>Program</TableCell>
              <TableCell>Readiness</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Updated</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s._id} hover>
                <TableCell>{s.course?.name || s.title || '—'}</TableCell>
                <TableCell>{`${(s.instructor || s.instructorId)?.firstName || ''} ${(s.instructor || s.instructorId)?.lastName || ''}`.trim() || '—'}</TableCell>
                <TableCell>{s.programId?.name || '—'}</TableCell>
                <TableCell><ReadinessCell syllabus={s} /></TableCell>
                <TableCell><StatusChip status={s.status} /></TableCell>
                <TableCell>{new Date(s.updatedAt).toLocaleDateString()}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Open chat interface">
                    <IconButton size="small" onClick={() => navigate(`/workspace/${s._id}`)}><Chat fontSize="small" /></IconButton>
                  </Tooltip>
                  {s.status === 'submitted' && s.submissionEmailStatus === 'failed' && (
                    <Tooltip title="Resend submission email">
                      <IconButton size="small" onClick={() => resend(s._id)}><Email fontSize="small" /></IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Delete syllabus">
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        disabled={deletingId === s._id}
                        onClick={() => deleteSyllabus(s)}
                      >
                        {deletingId === s._id ? <CircularProgress size={16} color="inherit" /> : <Delete fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>No syllabi found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {total > 20 && (
        <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: 'center' }}>
          <Button size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <Typography variant="body2" sx={{ alignSelf: 'center' }}>Page {page}</Typography>
          <Button size="small" disabled={rows.length < 20} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </Stack>
      )}
      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
};

// ─── Users tab ────────────────────────────────────────────────────────────────

const UsersTab = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', role: 'instructor' });
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.cabinet.getUsers({ limit: 100 });
      setRows(data.users || []);
    } catch {
      setSnack('Failed to load users');
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
      setForm({ email: '', firstName: '', lastName: '', role: 'instructor' });
      setSnack('User created and invitation sent');
      load();
    } catch (err) {
      setSnack(err.response?.data?.message || 'Create failed');
    } finally {
      setSaving(false);
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
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Verified</TableCell>
              <TableCell>Joined</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u._id} hover>
                <TableCell>{`${u.firstName} ${u.lastName}`}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><Chip label={u.role} size="small" /></TableCell>
                <TableCell>{u.isVerified ? 'Yes' : 'No'}</TableCell>
                <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
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
              <MenuItem value="instructor">Instructor</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={createUser} disabled={saving || !form.email || !form.firstName || !form.lastName}>
            {saving ? <CircularProgress size={18} /> : 'Create & invite'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
};

// ─── Programs tab ─────────────────────────────────────────────────────────────

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
      setSnack(editing ? 'Program updated' : 'Program created');
      reload();
    } catch (err) {
      setSnack(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this program?')) return;
    try {
      await api.cabinet.deleteProgram(id);
      setSnack('Deleted');
      reload();
    } catch (err) {
      setSnack(err.response?.data?.message || 'Delete failed');
    }
  };

  const isOpen = creating || !!editing;

  return (
    <Box>
      <Stack direction="row" sx={{ mb: 2 }}>
        <Button startIcon={<Add />} variant="contained" size="small" onClick={openCreate}>Add program</Button>
      </Stack>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Academic Director Email</TableCell>
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
              <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>No programs</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={isOpen} onClose={() => { setCreating(false); setEditing(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? 'Edit program' : 'Add program'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!editing && (
              <TextField label="Code (e.g. MBA)" size="small" fullWidth value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
            )}
            <TextField label="Name" size="small" fullWidth value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField label="Academic Director Email" size="small" fullWidth value={form.academicDirectorEmail}
              onChange={(e) => setForm((f) => ({ ...f, academicDirectorEmail: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCreating(false); setEditing(null); }}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving || !form.name || (!editing && !form.code)}>
            {saving ? <CircularProgress size={18} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
};

// ─── Cabinet page ─────────────────────────────────────────────────────────────

const Cabinet = () => {
  const [tab, setTab] = useState(0);
  const [metrics, setMetrics] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [error, setError] = useState('');

  const loadPrograms = useCallback(async () => {
    try {
      const { data } = await api.cabinet.listPrograms();
      setPrograms(data || []);
    } catch {
      setError('Failed to load programs');
    }
  }, []);

  const loadMetrics = useCallback(() => {
    api.cabinet.getMetrics().then(({ data }) => setMetrics(data)).catch(() => {});
  }, []);

  useEffect(() => {
    loadPrograms();
    loadMetrics();
  }, [loadPrograms, loadMetrics]);

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>Admin Cabinet</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <MetricsRow metrics={metrics} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Tab label="Syllabi" />
        <Tab label="Users" />
        <Tab label="Programs" />
      </Tabs>
      {tab === 0 && <SyllabiTab programs={programs} onChanged={loadMetrics} />}
      {tab === 1 && <UsersTab />}
      {tab === 2 && <ProgramsTab programs={programs} reload={loadPrograms} />}
    </Box>
  );
};

export default Cabinet;
