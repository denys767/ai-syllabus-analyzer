import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, CircularProgress, Alert, Container, Paper, Grid, Stack, Button, Snackbar, Alert as MuiAlert } from '@mui/material';
import api from '../services/api';
import RecommendationsPanel from '../components/Syllabus/RecommendationsPanel';

const SyllabusAnalysis = () => {
  const { id } = useParams();
  const [syllabus, setSyllabus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportError, setExportError] = useState(''); // legacy snackbar reuse for errors
  const [downloading, setDownloading] = useState(false);
  const hasAccepted = Array.isArray(syllabus?.recommendations) && syllabus.recommendations.some(r => r.status === 'accepted');

  const handleDownloadModified = async () => {
    try {
      setDownloading(true);
      const resp = await api.syllabusDownloadModified(syllabus._id);
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const link = document.createElement('a');
      link.href = url;
      const disposition = resp.headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match ? match[1] : `${syllabus.title}-modified.txt`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setExportError('Не вдалося завантажити оновлений файл');
    } finally {
      setDownloading(false);
    }
  };

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
            <Typography variant="body2" color="text.secondary" sx={{ mt:1 }}>Прийміть потрібні зміни – тоді стане доступним оновлений файл.</Typography>
          </Box>
          <Box>
            <Button variant="contained" disabled={!hasAccepted || downloading} onClick={handleDownloadModified}>
              {downloading ? 'Завантаження...' : 'Завантажити оновлений файл'}
            </Button>
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
  <Snackbar open={!!exportError} autoHideDuration={4000} onClose={()=> setExportError('')} anchorOrigin={{ vertical:'bottom', horizontal:'center' }}>
      <MuiAlert severity="error" variant="filled" onClose={()=> setExportError('')}>
        {exportError}
      </MuiAlert>
    </Snackbar>
  </>
  );
};

export default SyllabusAnalysis;
