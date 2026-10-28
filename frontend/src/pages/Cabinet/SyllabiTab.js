import React, { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Chat from '@mui/icons-material/Chat';
import Delete from '@mui/icons-material/Delete';
import Description from '@mui/icons-material/Description';
import Refresh from '@mui/icons-material/Refresh';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { docxFallbackName, filenameFromDisposition, saveBlob } from '../../utils/files';
import { describeError } from '../../utils/apiError';

const statusColor = { in_progress: 'warning', analyzing: 'info', error: 'error' };
const statusLabel = { in_progress: 'In progress', analyzing: 'Analysing', error: 'Error' };

const StatusChip = ({ status }) => (
  <Chip label={statusLabel[status] || status || '—'} size="small" color={statusColor[status] || 'default'} />
);

const ReadinessCell = ({ syllabus }) => {
  const score = Number(syllabus.readiness?.score || 0);
  const counts = syllabus.readiness?.counts || {};
  return (
    <Box sx={{ minWidth: 130 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{score}%</Typography>
        {counts.required > 0 && (
          <Typography variant="caption" color="text.secondary">
            {counts.approved}/{counts.required} approved
          </Typography>
        )}
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.max(0, Math.min(100, score))}
        color="primary"
        sx={{ height: 6, borderRadius: 1 }}
      />
    </Box>
  );
};

const SyllabiTab = ({ programs, isAdmin, user, onChanged }) => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [program, setProgram] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [snack, setSnack] = useState('');
  const userId = user?.id || user?._id || '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.cabinet.getSyllabi({ program, status, page, limit: 20 });
      setRows(data.syllabi || []);
      setTotal(data.total || 0);
    } catch (err) {
      setSnack(err.response?.data?.message || "Could not load syllabi");
    } finally {
      setLoading(false);
    }
  }, [program, status, page]);

  useEffect(() => { load(); }, [load]);

  const download = async (syllabus) => {
    try {
      const response = await api.chat.downloadDocx(syllabus._id || syllabus.id);
      saveBlob(response.data, filenameFromDisposition(response.headers?.['content-disposition']) || docxFallbackName(syllabus.title || syllabus.course?.name));
      setRows((list) => list.map((row) => row === syllabus ? { ...row, downloads: (row.downloads || 0) + 1 } : row));
      onChanged?.();
    } catch (err) { setSnack((await describeError(err)).message); }
  };

  const getOwnerId = (syllabus) => {
    const owner = syllabus.instructor || syllabus.instructorId;
    if (!owner) return '';
    return typeof owner === 'object' ? String(owner._id || owner.id || '') : String(owner);
  };

  const canDeleteSyllabus = (syllabus) => isAdmin || (userId && getOwnerId(syllabus) === String(userId));

  const clearDeletedWorkspaceState = (syllabusId) => {
    const openTabsKey = `pt.openTabs.v1.${userId || 'anon'}`;
    const lastChatKey = `pt.lastChat.v1.${userId || 'anon'}`;
    try {
      const tabs = JSON.parse(localStorage.getItem(openTabsKey) || '[]');
      if (Array.isArray(tabs)) {
        localStorage.setItem(openTabsKey, JSON.stringify(tabs.filter((tab) => tab.id !== syllabusId)));
      }
      if (localStorage.getItem(lastChatKey) === syllabusId) {
        localStorage.removeItem(lastChatKey);
      }
    } catch {
      // Очищення сховища браузера — best-effort; остаточним є видалення на сервері.
    }
  };

  const deleteSyllabus = async (syllabus) => {
    if (!canDeleteSyllabus(syllabus)) {
      setSnack("You can only delete your own syllabi");
      return;
    }
    const courseTitle = syllabus.course?.name || syllabus.title || "this syllabus";
    if (!window.confirm(`Delete “${courseTitle}”? This cannot be undone.`)) return;
    setDeletingId(syllabus._id);
    try {
      await api.syllabus.deleteSyllabus(syllabus._id);
      clearDeletedWorkspaceState(syllabus._id);
      setSnack("Syllabus deleted");
      onChanged?.();
      if (rows.length === 1 && page > 1) setPage((p) => p - 1);
      else load();
    } catch (err) {
      setSnack(err.response?.data?.message || "Could not delete");
    } finally {
      setDeletingId('');
    }
  };

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
        <Select size="small" value={program} onChange={(e) => { setProgram(e.target.value); setPage(1); }} displayEmpty sx={{ minWidth: 160 }}>
          <MenuItem value="">All programmes</MenuItem>
          {programs.map((p) => <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>)}
        </Select>
        <Select size="small" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} displayEmpty sx={{ minWidth: 140 }}>
          <MenuItem value="">All statuses</MenuItem>
          {['analyzing', 'in_progress', 'error'].map((s) => <MenuItem key={s} value={s}>{statusLabel[s] || s}</MenuItem>)}
        </Select>
        <IconButton onClick={load} disabled={loading}><Refresh /></IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>Total: {total}</Typography>
      </Stack>
      {loading && <CircularProgress size={20} sx={{ mb: 2 }} />}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Course</TableCell>
              <TableCell>Instructor</TableCell>
              <TableCell>Programme</TableCell>
              <TableCell>Readiness</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Downloads</TableCell>
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
                <TableCell>{s.downloads ?? 0}</TableCell>
                <TableCell>{new Date(s.updatedAt).toLocaleDateString('en-GB')}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Open chat">
                    <IconButton size="small" onClick={() => navigate(`/workspace/${s._id}`)}><Chat fontSize="small" /></IconButton>
                  </Tooltip>
                  {(s.outputs || []).includes('syllabus.docx') && (
                    <Tooltip title="Download .docx"><IconButton size="small" onClick={() => download(s)}><Description fontSize="small" /></IconButton></Tooltip>
                  )}
                  {canDeleteSyllabus(s) && (
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
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>No syllabi found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {total > 20 && (
        <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: 'center' }}>
          <Button size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Back</Button>
          <Typography variant="body2" sx={{ alignSelf: 'center' }}>Page {page}</Typography>
          <Button size="small" disabled={rows.length < 20} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </Stack>
      )}
      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
};

export default SyllabiTab;
