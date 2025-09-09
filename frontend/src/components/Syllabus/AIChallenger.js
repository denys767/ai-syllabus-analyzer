import React, { useMemo, useState } from 'react';
import { Box, Typography, TextField, Button, CircularProgress, Paper, Avatar, Grid } from '@mui/material';
import { Psychology, School } from '@mui/icons-material';
import api from '../../services/api';

const AIChallenger = ({ syllabus, onChallengeUpdate, onNewRecommendations }) => {
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const challenge = syllabus.practicalChallenge;
  const discussionCount = useMemo(() => (challenge?.discussion?.length || 0), [challenge]);
  const maxRounds = 3; // configurable number of follow-ups
  const isCompleted = (challenge?.status === 'completed') || (discussionCount >= maxRounds);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!response.trim()) return;

    setLoading(true);
    setError('');
    try {
      const res = await api.post('/ai/challenge/respond', {
        syllabusId: syllabus._id,
        response: response,
      });
      setResponse('');
      // Backend returns updated challenge + any new recs
      if (res.data?.newRecommendations && onNewRecommendations) {
        onNewRecommendations(res.data.newRecommendations);
      }
      if (discussionCount + 1 >= maxRounds) {
        try { await api.post(`/syllabus/${syllabus._id}/challenge/finalize`); } catch(e){ /* non-critical */ }
      }
      if (onChallengeUpdate) onChallengeUpdate();
    } catch (err) {
      setError(err.response?.data?.message || 'Помилка запиту');
      console.error(err);
    } finally { setLoading(false); }
  };

  

  if (!challenge || !challenge.initialQuestion) {
    return (
      <Box mt={4}>
        <Typography variant="h6" gutterBottom>AI Челенджер</Typography>
        <Typography color="text.secondary">AI-челенджер для цього силабусу ще не запущено.</Typography>
      </Box>
    );
  }

  return (
    <Box mt={2}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
  <Psychology sx={{ mr: 1, color: 'primary.main' }} /> AI Челенджер ({Math.min(discussionCount, maxRounds)}/{maxRounds})
      </Typography>
  <Paper elevation={2} sx={{ p: 2, maxHeight: '400px', overflowY: 'auto' }}>
        {/* Initial Question */}
        <Grid container wrap="nowrap" spacing={2} sx={{ mb: 2 }}>
          <Grid item>
            <Avatar sx={{ bgcolor: 'primary.main' }}><Psychology /></Avatar>
          </Grid>
          <Grid item xs>
            <Paper sx={{ p: 1.5, bgcolor: 'grey.100' }}>
              <Typography variant="body2">{challenge.initialQuestion}</Typography>
            </Paper>
          </Grid>
  </Grid>

        {/* Discussion History */}
        {challenge.discussion && challenge.discussion.map((entry, index) => (
          <React.Fragment key={index}>
            {/* Instructor Response */}
            <Grid container wrap="nowrap" spacing={2} sx={{ mb: 2, justifyContent: 'flex-end' }}>
              <Grid item xs>
                <Paper sx={{ p: 1.5, bgcolor: 'secondary.light', color: 'secondary.contrastText' }}>
                  <Typography variant="body2">{entry.instructorResponse}</Typography>
                </Paper>
              </Grid>
              <Grid item>
                <Avatar sx={{ bgcolor: 'secondary.main' }}><School /></Avatar>
              </Grid>
            </Grid>
            {/* AI Response */}
            <Grid container wrap="nowrap" spacing={2} sx={{ mb: 2 }}>
              <Grid item>
                <Avatar sx={{ bgcolor: 'primary.main' }}><Psychology /></Avatar>
              </Grid>
              <Grid item xs>
                <Paper sx={{ p: 1.5, bgcolor: 'grey.100' }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{entry.aiResponse}</Typography>
                </Paper>
              </Grid>
            </Grid>
          </React.Fragment>
        ))}
      </Paper>

      {/* Response Form */}
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
        <TextField
          fullWidth
          multiline
          rows={3}
          variant="outlined"
          placeholder="Ваша відповідь..."
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          disabled={loading || isCompleted}
        />
        {error && <Typography color="error" variant="caption" sx={{ mt: 1 }}>{error}</Typography>}
        <Button
          type="submit"
          variant="contained"
          sx={{ mt: 1 }}
          disabled={loading || !response.trim() || isCompleted}
        >
          {loading ? <CircularProgress size={24} /> : isCompleted ? 'Завершено' : 'Надіслати відповідь'}
        </Button>
        {isCompleted && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
            Дискусію завершено. Нові ідеї додано до списку.
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default AIChallenger;
