import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, TextField, Button, CircularProgress, Paper, Avatar, Grid } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Psychology, School } from '@mui/icons-material';
import api from '../../services/api';

const AIChallenger = ({ syllabus, onChallengeUpdate, onNewRecommendations }) => {
  const LONG_AI_TIMEOUT = 120000; // 2 minutes for long-running LLM calls
  const EXPECTED_WAIT_SECONDS = Math.floor(LONG_AI_TIMEOUT / 1000);
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const challenge = syllabus.practicalChallenge;
  const discussionCount = useMemo(() => (challenge?.discussion?.length || 0), [challenge]);
  const maxRounds = 1; // single-question challenge
  const isCompleted = (challenge?.status === 'completed') || (discussionCount >= maxRounds);

  useEffect(() => {
    let timerId;
    if (loading) {
      const startedAt = Date.now();
      timerId = setInterval(() => {
        setElapsedMs(Date.now() - startedAt);
      }, 1000);
    } else {
      setElapsedMs(0);
    }

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!response.trim()) return;

    setLoading(true);
    setError('');
    try {
      const res = await api.post('/ai/challenge/respond', {
        syllabusId: syllabus._id,
        response: response,
      }, { timeout: LONG_AI_TIMEOUT });
      setResponse('');
      // Backend returns updated challenge + any new recs
      if (res.data?.newRecommendations && onNewRecommendations) {
        onNewRecommendations(res.data.newRecommendations);
      }
      if (discussionCount + 1 >= maxRounds) {
        try { await api.post(`/ai/challenge/finalize`, { syllabusId: syllabus._id }); } catch(e){ /* non-critical */ }
      }
      if (onChallengeUpdate) onChallengeUpdate();
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        setError('Still working... this may take up to 2 minutes. The answer will appear once ready.');
        // Poll for updates since backend will finish even after timeout
        if (onChallengeUpdate) {
          setTimeout(() => onChallengeUpdate(), 4000);
        }
      } else {
        setError(err.response?.data?.message || 'Request error');
      }
      console.error(err);
    } finally { setLoading(false); }
  };

  

  if (!challenge || !challenge.initialQuestion) {
    return (
      <Box mt={4}>
        <Typography variant="h6" gutterBottom>AI Challenger</Typography>
        <Typography color="text.secondary">The AI challenger for this syllabus has not been started yet.</Typography>
      </Box>
    );
  }

  return (
    <Box mt={2}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
        <Psychology sx={{ mr: 1, color: 'primary.main' }} /> AI Challenger ({Math.min(discussionCount, maxRounds)}/{maxRounds})
      </Typography>
      <Paper elevation={2} sx={{ 
        p: 2, 
        maxHeight: '400px', 
        overflowY: 'auto', 
        bgcolor: isDark ? 'background.default' : 'background.paper',
        border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
        '&::-webkit-scrollbar': { width: 8 },
        '&::-webkit-scrollbar-track': { background: isDark ? '#111' : '#f1f1f1' },
        '&::-webkit-scrollbar-thumb': { background: isDark ? '#333' : '#ccc', borderRadius: 4 }
      }}>
        {/* Initial Question */}
        <Grid container wrap="nowrap" spacing={2} sx={{ mb: 2 }}>
          <Grid item>
            <Avatar sx={{ bgcolor: 'primary.main' }}><Psychology /></Avatar>
          </Grid>
          <Grid item xs>
            <Paper sx={{ p: 1.5, bgcolor: isDark ? 'grey.800' : 'grey.100', color: 'text.primary' }}>
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
                <Paper sx={{ p: 1.5, bgcolor: isDark ? 'secondary.dark' : 'secondary.light', color: isDark ? 'grey.100' : 'secondary.contrastText' }}>
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
                <Paper sx={{ p: 1.5, bgcolor: isDark ? 'grey.800' : 'grey.100', color: isDark ? 'grey.100' : 'text.primary' }}>
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
          placeholder="Your response..."
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
          {loading ? <CircularProgress size={24} /> : isCompleted ? 'Completed' : 'Send Response'}
        </Button>
        {loading && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Generating a tailored AI reply (~{Math.round(EXPECTED_WAIT_SECONDS / 60)} min). Elapsed {Math.floor(elapsedMs / 1000)}s — keep this tab open.
          </Typography>
        )}
        {!loading && !isCompleted && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Full AI responses usually take about {Math.round(EXPECTED_WAIT_SECONDS / 60)} minutes (~{Math.round(EXPECTED_WAIT_SECONDS / 10) * 10} seconds).
          </Typography>
        )}
        {isCompleted && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
            Discussion completed. New ideas added to the list.
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default AIChallenger;
