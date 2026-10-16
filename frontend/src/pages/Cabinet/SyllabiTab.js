import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { Chat, Delete, Description, Email, PictureAsPdf, Refresh, Slideshow } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { cabinetOutputs, downloadOutput } from '../../utils/download';

const fileIcon = (name) => {
  if (name.endsWith('.pdf')) return <PictureAsPdf fontSize="small" />;
  if (name.endsWith('.pptx')) return <Slideshow fontSize="small" />;
  return <Description fontSize="small" />;
};

const statusColor = { submitted: 'success', in_progress: 'warning', analyzing: 'info', error: 'error' };
const statusLabel = {
  submitted: 'Надіслано',
  in_progress: 'У роботі',
  analyzing: 'Аналізується',
  error: 'Помилка',
};

const StatusChip = ({ status }) => (
  <Chip label={statusLabel[status] || status || '—'} size="small" color={statusColor[status] || 'default'} />
);

const ReadinessCell = ({ syllabus }) => {
  const score = Number(syllabus.readiness?.score || 0);
  const counts = syllabus.issueCounts || {};
  const pending = Number(counts.pending || 0);
  const total = Number(counts.total || 0);
  const resolved = Number(counts.accepted || 0) + Number(counts.rejected || 0);
  return (
    <Box sx={{ minWidth: 130 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{score}%</Typography>
        {total > 0 && (
          <Typography variant="caption" color="text.secondary">
            {resolved}/{total} опрацьовано
          </Typography>
        )}
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.max(0, Math.min(100, score))}
        color={total > 0 && pending === 0 ? 'success' : 'primary'}
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
      setSnack(err.response?.data?.message || 'Не вдалося завантажити силабуси');
    } finally {
      setLoading(false);
    }
  }, [program, status, page]);

  useEffect(() => { load(); }, [load]);

  const resend = async (id) => {
    try {
      await api.cabinet.resendSubmission(id);
      setSnack('Лист надіслано повторно');
      load();
    } catch (err) {
      setSnack(err.response?.data?.message || 'Не вдалося надіслати повторно');
    }
  };

  const download = async (syllabus, name) => {
    const failure = await downloadOutput(syllabus._id, name, syllabus.course?.name || syllabus.title || 'syllabus');
    if (failure) setSnack(failure);
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
      setSnack('Можна видаляти лише власні силабуси');
      return;
    }
    const courseTitle = syllabus.course?.name || syllabus.title || 'цей силабус';
    if (!window.confirm(`Видалити «${courseTitle}»? Цю дію неможливо скасувати.`)) return;
    setDeletingId(syllabus._id);
    try {
      await api.syllabus.deleteSyllabus(syllabus._id);
      clearDeletedWorkspaceState(syllabus._id);
      setSnack('Силабус видалено');
      onChanged?.();
      if (rows.length === 1 && page > 1) setPage((p) => p - 1);
      else load();
    } catch (err) {
      setSnack(err.response?.data?.message || 'Не вдалося видалити');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
        <Select size="small" value={program} onChange={(e) => { setProgram(e.target.value); setPage(1); }} displayEmpty sx={{ minWidth: 160 }}>
          <MenuItem value="">Усі програми</MenuItem>
          {programs.map((p) => <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>)}
        </Select>
        <Select size="small" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} displayEmpty sx={{ minWidth: 140 }}>
          <MenuItem value="">Усі статуси</MenuItem>
          {['analyzing', 'in_progress', 'submitted', 'error'].map((s) => <MenuItem key={s} value={s}>{statusLabel[s] || s}</MenuItem>)}
        </Select>
        <IconButton onClick={load} disabled={loading}><Refresh /></IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>Усього: {total}</Typography>
      </Stack>
      {loading && <CircularProgress size={20} sx={{ mb: 2 }} />}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Курс</TableCell>
              <TableCell>Викладач</TableCell>
              <TableCell>Програма</TableCell>
              <TableCell>Готовність</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Оновлено</TableCell>
              <TableCell align="right">Дії</TableCell>
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
                <TableCell>{new Date(s.updatedAt).toLocaleDateString('uk-UA')}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Відкрити чат">
                    <IconButton size="small" onClick={() => navigate(`/workspace/${s._id}`)}><Chat fontSize="small" /></IconButton>
                  </Tooltip>
                  {s.status === 'submitted' && cabinetOutputs(s).map((file) => (
                    <Tooltip key={file.name} title={file.label}>
                      <IconButton size="small" onClick={() => download(s, file.name)}>{fileIcon(file.name)}</IconButton>
                    </Tooltip>
                  ))}
                  {s.status === 'submitted' && s.submissionEmailStatus === 'failed' && isAdmin && (
                    <Tooltip title="Надіслати лист повторно">
                      <IconButton size="small" onClick={() => resend(s._id)}><Email fontSize="small" /></IconButton>
                    </Tooltip>
                  )}
                  {canDeleteSyllabus(s) && (
                    <Tooltip title="Видалити силабус">
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
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>Силабусів не знайдено</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {total > 20 && (
        <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: 'center' }}>
          <Button size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Назад</Button>
          <Typography variant="body2" sx={{ alignSelf: 'center' }}>Сторінка {page}</Typography>
          <Button size="small" disabled={rows.length < 20} onClick={() => setPage((p) => p + 1)}>Далі</Button>
        </Stack>
      )}
      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
};

export default SyllabiTab;
