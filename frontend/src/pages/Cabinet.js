import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const programOptions = ['', 'MBA', 'EMBA', 'Corporate', 'Intensive'];

function Cabinet() {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [syllabi, setSyllabi] = useState([]);
  const [summary, setSummary] = useState({ total: 0, submitted: 0, inProgress: 0 });
  const [users, setUsers] = useState([]);
  const [config, setConfig] = useState({ academicDirectorEmail: '' });
  const [program, setProgram] = useState('');
  const [error, setError] = useState('');
  const [userDialog, setUserDialog] = useState(false);
  const [userForm, setUserForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'instructor',
  });

  const loadCabinet = useCallback(async () => {
    try {
      const [syllabiResponse, usersResponse, configResponse] = await Promise.all([
        api.admin.getSyllabi(program ? { program } : {}),
        api.admin.getUsers(),
        api.admin.getConfig(),
      ]);
      setSyllabi(syllabiResponse.data.syllabi || []);
      setSummary(syllabiResponse.data.summary || { total: 0, submitted: 0, inProgress: 0 });
      setUsers(usersResponse.data.users || []);
      setConfig(configResponse.data || { academicDirectorEmail: '' });
      setError('');
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Failed to load cabinet.');
    }
  }, [program]);

  useEffect(() => {
    loadCabinet();
  }, [loadCabinet]);

  async function handleSaveConfig() {
    try {
      const response = await api.admin.updateConfig(config);
      setConfig(response.data);
      setError('');
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Failed to save config.');
    }
  }

  async function handleCreateUser() {
    try {
      await api.admin.createUser(userForm);
      setUserDialog(false);
      setUserForm({ firstName: '', lastName: '', email: '', role: 'instructor' });
      await loadCabinet();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Failed to create user.');
    }
  }

  const activePrograms = useMemo(
    () => Array.from(new Set(syllabi.map((syllabus) => syllabus.program).filter(Boolean))),
    [syllabi]
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Paper sx={{ p: 3, borderRadius: 4 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h3">Admin Cabinet</Typography>
            <Typography color="text.secondary">
              {user?.firstName} {user?.lastName} · {user?.email}
            </Typography>
          </Box>
          <Chip label="Admin" color="warning" sx={{ width: 'fit-content' }} />
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper sx={{ p: 1.5, borderRadius: 4 }}>
        <Tabs value={tab} onChange={(_, next) => setTab(next)}>
          <Tab label="Syllabi" />
          <Tab label="Users" />
        </Tabs>
      </Paper>

      {tab === 0 && (
        <Stack spacing={3}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
            <MetricCard label="Total" value={summary.total} />
            <MetricCard label="Submitted" value={summary.submitted} />
            <MetricCard label="In Progress" value={summary.inProgress} />
          </Stack>

          <Paper sx={{ p: 2.5, borderRadius: 4 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
              <Typography fontWeight={600}>All Programs</Typography>
              <Select value={program} onChange={(event) => setProgram(event.target.value)} size="small" sx={{ minWidth: 220 }}>
                {programOptions
                  .filter((option) => option === '' || activePrograms.includes(option) || program === option)
                  .map((option) => (
                    <MenuItem key={option || 'all'} value={option}>
                      {option || 'All Programs'}
                    </MenuItem>
                  ))}
              </Select>
            </Stack>
          </Paper>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Course</TableCell>
                  <TableCell>Instructor</TableCell>
                  <TableCell>Program</TableCell>
                  <TableCell>Readiness</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Updated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {syllabi.map((syllabus) => (
                  <TableRow key={syllabus._id}>
                    <TableCell>{syllabus.title}</TableCell>
                    <TableCell>
                      {syllabus.instructor?.firstName} {syllabus.instructor?.lastName}
                    </TableCell>
                    <TableCell>
                      <Chip label={syllabus.program} size="small" />
                    </TableCell>
                    <TableCell sx={{ minWidth: 180 }}>
                      <Typography variant="body2">{syllabus.readinessPct}%</Typography>
                      <LinearProgress variant="determinate" value={syllabus.readinessPct || 0} sx={{ mt: 1, borderRadius: 999 }} />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={syllabus.workspaceStatus}
                        size="small"
                        color={syllabus.workspaceStatus === 'Submitted' ? 'success' : syllabus.workspaceStatus === 'In Progress' ? 'info' : 'default'}
                      />
                    </TableCell>
                    <TableCell>{new Date(syllabus.updatedAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Academic Director Email
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  fullWidth
                  label="Academic Director email"
                  value={config.academicDirectorEmail || ''}
                  onChange={(event) => setConfig((current) => ({ ...current, academicDirectorEmail: event.target.value }))}
                />
                <Button variant="contained" onClick={handleSaveConfig}>
                  Save
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Paper sx={{ p: 2.5, borderRadius: 4 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
              <Box>
                <Typography variant="h6">Users</Typography>
                <Typography color="text.secondary">Invite instructors and admins by email.</Typography>
              </Box>
              <Button variant="contained" onClick={() => setUserDialog(true)}>
                + Create user
              </Button>
            </Stack>
          </Paper>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last active</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((entry) => (
                  <TableRow key={entry._id}>
                    <TableCell>
                      <Typography>{entry.firstName} {entry.lastName}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {entry.email}
                      </Typography>
                    </TableCell>
                    <TableCell>{entry.role}</TableCell>
                    <TableCell>
                      <Chip label={entry.status} size="small" color={entry.status === 'Active' ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell>{new Date(entry.lastActive).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}

      <Dialog open={userDialog} onClose={() => setUserDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="First name" value={userForm.firstName} onChange={(event) => setUserForm((current) => ({ ...current, firstName: event.target.value }))} />
            <TextField label="Last name" value={userForm.lastName} onChange={(event) => setUserForm((current) => ({ ...current, lastName: event.target.value }))} />
            <TextField label="Email" value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} />
            <TextField
              select
              label="Role"
              value={userForm.role}
              onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}
            >
              <MenuItem value="instructor">Instructor</MenuItem>
              <MenuItem value="manager">Manager</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateUser}>
            Invite
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function MetricCard({ label, value }) {
  return (
    <Card sx={{ flex: 1 }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4">{value}</Typography>
      </CardContent>
    </Card>
  );
}

export default Cabinet;
