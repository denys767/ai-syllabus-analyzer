import React, { useMemo, useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  Stack,
  TextField,
  Paper,
  Divider,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material';
import api from '../../services/api';
import AIChallenger from './AIChallenger';

const StatusChip = ({ status }) => {
  const color =
    status === 'accepted' ? 'success' : status === 'rejected' ? 'error' : status === 'commented' ? 'warning' : 'default';
  return <Chip label={status || 'pending'} color={color} size="small" sx={{ textTransform: 'capitalize' }} />;
};

const PriorityChip = ({ priority }) => {
  const color = priority === 'critical' ? 'error' : priority === 'high' ? 'warning' : priority === 'medium' ? 'info' : 'default';
  return <Chip label={`priority: ${priority || 'medium'}`} color={color} size="small" variant="outlined" />;
};

export default function RecommendationsPanel({ syllabusId, recommendations = [], onChanged, syllabus }) {
  const [workingId, setWorkingId] = useState(null);
  const [commentingId, setCommentingId] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pdfReady, setPdfReady] = useState(syllabus?.editingStatus === 'ready' && syllabus?.editedPdf);
  const [pdfMeta, setPdfMeta] = useState(syllabus?.editedPdf || null);
  const [editingStatus, setEditingStatus] = useState(syllabus?.editingStatus || 'idle');
  const [polling, setPolling] = useState(false);

  const grouped = useMemo(() => {
    const groups = {
      'Відповідність до шаблону': [],
      'Відповідність до learning objectives': [],
      'Збіг з попередніми силабусами': [],
      'Інтеграція прикладів для кластеру студентів': [],
      'Інше': []
    };
    recommendations.forEach(r => {
      if (r.category === 'structure') groups['Відповідність до шаблону'].push(r);
      else if (r.category === 'objectives') groups['Відповідність до learning objectives'].push(r);
      else if (r.category === 'plagiarism') groups['Збіг з попередніми силабусами'].push(r);
      else if (r.category === 'cases') groups['Інтеграція прикладів для кластеру студентів'].push(r);
      else if (r.category === 'content' || r.category === 'methods' || r.category === 'assessment') groups['Інше'].push(r);
    });
    // Placeholder: plagiarism based recs would be inserted here if backend supplies category
    return groups;
  }, [recommendations]);

  const tabs = Object.keys(grouped);

  const update = async (rec, data) => {
    try {
      setWorkingId(rec._id || rec.id);
      setError('');
      await api.syllabus.updateRecommendation(syllabusId, rec._id || rec.id, data);
      setCommentingId(null);
      setCommentText('');
      onChanged?.();
    } catch (e) {
      setError(e.response?.data?.message || 'Не вдалося оновити рекомендацію');
    } finally {
      setWorkingId(null);
    }
  };

  const allAccepted = recommendations.some(r => r.status === 'accepted');

  useEffect(() => {
    setEditingStatus(syllabus?.editingStatus || 'idle');
    setPdfMeta(syllabus?.editedPdf || null);
    setPdfReady(syllabus?.editingStatus === 'ready' && !!syllabus?.editedPdf);
    setPolling(syllabus?.editingStatus === 'processing');
  }, [syllabus]);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await api.syllabus.getEditingStatus(syllabus._id);
        setEditingStatus(data.status);
        if (data.editedPdf && data.status === 'ready') {
          setPdfMeta(data.editedPdf);
          setPdfReady(true);
          setPolling(false);
          onChanged?.();
        }
        if (data.status === 'error') {
          setError(data.error || 'LLM не зміг згенерувати зміни');
          setPolling(false);
          setGenerating(false); // Вимикаємо індикатор завантаження при помилці
        }
      } catch (err) {
        setError('Не вдалося оновити статус редагування');
        setPolling(false);
        setGenerating(false); // Вимикаємо індикатор завантаження при помилці
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [polling, syllabus?._id, onChanged]);

  const requestPdfGeneration = async () => {
    try {
      setGenerating(true);
      setError('');
      await api.syllabus.requestDiffPdf(syllabus._id);
      setEditingStatus('processing');
      setPdfReady(false);
      setPolling(true);
    } catch (err) {
      const msg = err.response?.data?.message || 'Не вдалося запустити генерацію PDF';
      setError(msg);
    } finally {
      setGenerating(false);
      setEditing(false);
    }
  };

  const downloadPdf = async () => {
    try {
      setGenerating(true);
      const resp = await api.syllabus.downloadEditedPdf(syllabus._id);
      const url = window.URL.createObjectURL(new Blob([resp.data], { type: resp.headers['content-type'] || 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      const disposition = resp.headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match ? match[1] : (pdfMeta?.filename || `${(syllabus.title || 'syllabus')}-diff.pdf`);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Не вдалося завантажити PDF зі змінами');
    } finally {
      setGenerating(false);
    }
  };
  return (
    <Box sx={{
      // Make the panel feel wider by relaxing max width constraints inside the Paper
      '& .rec-card': { width: '100%' }
    }}>
      <Typography variant="h6" gutterBottom>
        Рекомендації AI
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Приймайте або відхиляйте пропозиції змін до силабусу. Після завершення буде згенеровано оновлений файл.
      </Typography>
      <Tabs value={tab} onChange={(e,v)=> setTab(v)} sx={{ mb:2 }} variant="scrollable" scrollButtons allowScrollButtonsMobile>
        {tabs.map(label => <Tab key={label} label={`${label} (${grouped[label].length})`} />)}
      </Tabs>
      <Stack direction="row" spacing={1} sx={{ mb:2 }}>
        <Button
          size="small"
          variant={editing ? 'contained' : 'outlined'}
          disabled={!allAccepted || editingStatus === 'processing'}
          onClick={() => setEditing(v => !v)}
        >
          Редагувати силабус з AI
        </Button>
        {editing && (
          <Button
            size="small"
            variant="contained"
            color="secondary"
            onClick={requestPdfGeneration}
            disabled={generating}
            startIcon={generating ? <CircularProgress size={14} /> : null}
          >
            {generating ? 'Надсилаємо...' : 'Відправити на обробку' }
          </Button>
        )}
        {!editing && pdfReady && (
          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={downloadPdf}
            disabled={generating}
            startIcon={generating ? <CircularProgress size={14} /> : null}
          >
            {generating ? 'Готуємо файл...' : 'Завантажити PDF зі змінами'}
          </Button>
        )}
        {editingStatus === 'processing' && (
          <Chip 
            color="info" 
            label="LLM обробляє..." 
            size="small"
            icon={<CircularProgress size={14} />}
          />
        )}
        {editingStatus === 'error' && (
          <Chip 
            color="error" 
            label="Помилка обробки" 
            size="small"
            variant="outlined"
          />
        )}
        {pdfMeta && pdfReady && (
          <Chip color="default" size="small" label={`Оновлено: ${new Date(pdfMeta.generatedAt).toLocaleString('uk-UA')}`} />
        )}
      </Stack>
      {error && (
        <Typography color="error" variant="caption" sx={{ display: 'block', mb: 1 }}>
          {error}
        </Typography>
      )}

      {(!recommendations || recommendations.length === 0) && (
        <Typography variant="body2" color="text.secondary">Рекомендацій поки немає.</Typography>
      )}

      <Stack spacing={2} sx={{
        // On wider screens, ensure cards expand instead of looking like a thin column
        '@media (min-width: 1200px)': {
          '& > *': { width: '100%' }
        }
      }}>
        {(grouped[tabs[tab]]||[]).map((rec, idx) => (
          <Paper key={rec._id || rec.id || idx} className="rec-card" sx={{ p: 2 }} variant="outlined">
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label={rec.category || 'content'} size="small" />
                <PriorityChip priority={rec.priority} />
                <StatusChip status={rec.status} />
              </Stack>
              <Typography variant="subtitle1">{rec.title || 'Рекомендація'}</Typography>
            </Stack>
            {rec.description && (
              <Typography variant="body2" sx={{ mt: 1 }}>{rec.description}</Typography>
            )}

            {rec.instructorComment && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Ваш коментар: {rec.instructorComment}
              </Typography>
            )}
            {rec.aiResponse && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Відповідь AI: {rec.aiResponse}
              </Typography>
            )}

            <Divider sx={{ my: 1.5 }} />

            {commentingId === (rec._id || rec.id) ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Коментар"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <Button
                  variant="contained"
                  color="primary"
                  disabled={workingId === (rec._id || rec.id) || !commentText.trim()}
                  onClick={() => update(rec, { status: 'commented', comment: commentText.trim() })}
                >
                  Зберегти коментар
                </Button>
                <Button variant="text" onClick={() => { setCommentingId(null); setCommentText(''); }}>
                  Скасувати
                </Button>
              </Stack>
            ) : (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button
                  variant="contained"
                  color="success"
                  disabled={workingId === (rec._id || rec.id) || rec.status === 'accepted'}
                  onClick={() => update(rec, { status: 'accepted' })}
                >
                  Прийняти
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  disabled={workingId === (rec._id || rec.id) || rec.status === 'rejected'}
                  onClick={() => update(rec, { status: 'rejected' })}
                >
                  Відхилити
                </Button>
                <Button
                  variant="text"
                  color="secondary"
                  disabled={workingId === (rec._id || rec.id)}
                  onClick={() => { setCommentingId(rec._id || rec.id); setCommentText(rec.instructorComment || ''); }}
                >
                  Прокоментувати
                </Button>
              </Stack>
            )}
          </Paper>
        ))}
      </Stack>
      {/* Inline AI Challenger */}
      <Box sx={{ mt:4 }}>
        <AIChallenger syllabus={syllabus} onChallengeUpdate={onChanged} />
      </Box>
    </Box>
  );
}
