import React, { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  Stack,
  TextField,
  Paper,
  Divider,
} from '@mui/material';
import api from '../../services/api';

const StatusChip = ({ status }) => {
  const color =
    status === 'accepted' ? 'success' : status === 'rejected' ? 'error' : status === 'commented' ? 'warning' : 'default';
  return <Chip label={status || 'pending'} color={color} size="small" sx={{ textTransform: 'capitalize' }} />;
};

const PriorityChip = ({ priority }) => {
  const color = priority === 'critical' ? 'error' : priority === 'high' ? 'warning' : priority === 'medium' ? 'info' : 'default';
  return <Chip label={`priority: ${priority || 'medium'}`} color={color} size="small" variant="outlined" />;
};

export default function RecommendationsPanel({ syllabusId, recommendations = [], onChanged }) {
  const [workingId, setWorkingId] = useState(null);
  const [commentingId, setCommentingId] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [error, setError] = useState('');

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
        {recommendations.map((rec, idx) => (
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
    </Box>
  );
}
