import React, { useState } from 'react';
import {
  Box, Typography, TextField, Button, CircularProgress, Paper,
  FormControl, InputLabel, Select, MenuItem, Accordion,
  AccordionSummary, AccordionDetails, Chip
} from '@mui/material';
import { ExpandMore, Lightbulb } from '@mui/icons-material';
import api from '../../services/api';

const InteractiveRecommendations = ({ syllabus }) => {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recommendations, setRecommendations] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!topic.trim()) {
      setError('Введіть тему.');
      return;
    }

    setLoading(true);
    setError('');
    setRecommendations([]);
    try {
      const clusters = (syllabus.analysis?.studentClusterAnalysis?.dominantClusters || [])
        .map(c => c.cluster)
        .filter(Boolean);
      const response = await api.post('/ai/recommendations/interactive', {
        topic,
        difficulty,
        studentClusters: clusters,
      });
      setRecommendations(response.data.recommendations || []);
    } catch (err) {
  setError(err.response?.data?.message || 'Не вдалося згенерувати рекомендації.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box mt={2}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
  <Lightbulb sx={{ mr: 1, color: 'secondary.main' }} /> Інтерактивні ідеї
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
  Згенеруйте практичні ідеї, кейси та інтерактивні активності для будь-якої теми курсу.
      </Typography>

      <Paper component="form" onSubmit={handleSubmit} sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          label="Тема з вашого силабусу"
          variant="outlined"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          sx={{ mb: 2 }}
        />
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Рівень складності</InputLabel>
          <Select
            value={difficulty}
            label="Difficulty"
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <MenuItem value="beginner">Початковий</MenuItem>
            <MenuItem value="intermediate">Середній</MenuItem>
            <MenuItem value="advanced">Просунутий</MenuItem>
          </Select>
        </FormControl>
        {error && <Typography color="error" variant="caption">{error}</Typography>}
        <Button
          type="submit"
          variant="contained"
          color="secondary"
          disabled={loading || !topic.trim()}
        >
          {loading ? <CircularProgress size={24} /> : 'Згенерувати ідеї'}
        </Button>
      </Paper>

      {recommendations.length > 0 && (
        <Box>
          <Typography variant="subtitle1" gutterBottom>Згенеровані ідеї:</Typography>
          {recommendations.map((rec, index) => (
            <Accordion key={index}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Chip label={rec.type || 'Ідея'} color="secondary" size="small" sx={{ mr: 2 }} />
                <Typography>{rec.title}</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ bgcolor: 'grey.50' }}>
                <Typography variant="body2" sx={{ mb: 1 }}>{rec.description}</Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  <b>Релевантність:</b> {rec.relevance}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  <b>Можливі джерела:</b> {rec.potential_sources}
                </Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default InteractiveRecommendations;
