import React, { useMemo, useState } from 'react';
import { Box, Typography, TextField, Button, CircularProgress, Paper, Avatar, Grid } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Psychology, School } from '@mui/icons-material';
import api from '../../services/api';

const AIChallenger = ({ syllabus, onChallengeUpdate, onNewRecommendations }) => {
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
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
        try { await api.post(`/ai/challenge/finalize`, { syllabusId: syllabus._id }); } catch(e){ /* non-critical */ }
      }
      if (onChallengeUpdate) onChallengeUpdate();
    } catch (err) {
      setError(err.response?.data?.message || 'Request error');
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
