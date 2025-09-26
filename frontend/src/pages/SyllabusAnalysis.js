import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, CircularProgress, Alert, Container, Paper, Grid, Stack } from '@mui/material';
import api from '../services/api';
import RecommendationsPanel from '../components/Syllabus/RecommendationsPanel';

const SyllabusAnalysis = () => {
  const { id } = useParams();
  const [syllabus, setSyllabus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSyllabus = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/syllabus/${id}`);
      setSyllabus(response.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch syllabus data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSyllabus();
  }, [fetchSyllabus]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!syllabus) {
    return <Typography>No syllabus data found.</Typography>;
  }

  // Exports removed per simplified spec

  return (
    <>
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction={{ xs:'column', sm:'row' }} justifyContent="space-between" alignItems={{ sm:'center' }} spacing={2}>
          <Box>
            <Typography variant="h4" gutterBottom component="h1">{syllabus.title}</Typography>
            <Typography variant="subtitle1" color="text.secondary">{syllabus.course.name} ({syllabus.course.code})</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt:1 }}>
              Прийміть потрібні рекомендації, натисніть «Редагувати силабус з AI» і дочекайтесь PDF зі змінами.
            </Typography>
          </Box>
        </Stack>
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2 }}>
            <RecommendationsPanel
              syllabusId={syllabus._id}
              syllabus={syllabus}
              recommendations={syllabus.recommendations || []}
              onChanged={fetchSyllabus}
            />
          </Paper>
        </Grid>

      </Grid>
  </Container>
  </>
  );
};

export default SyllabusAnalysis;
