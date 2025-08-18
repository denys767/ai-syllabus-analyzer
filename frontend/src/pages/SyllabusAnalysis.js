import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, CircularProgress, Alert, Container, Paper, Grid, Stack, Button, Menu, MenuItem, Snackbar, Alert as MuiAlert } from '@mui/material';
import { Download } from '@mui/icons-material';
import api from '../services/api';
import AnalysisOverview from '../components/Syllabus/AnalysisOverview';
import RecommendationsPanel from '../components/Syllabus/RecommendationsPanel';
import AIChallenger from '../components/Syllabus/AIChallenger';
import InteractiveRecommendations from '../components/Syllabus/InteractiveRecommendations';
import GroupedRecommendations from '../components/Syllabus/GroupedRecommendations';

const SyllabusAnalysis = () => {
  const { id } = useParams();
  const [syllabus, setSyllabus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const exportOpen = Boolean(anchorEl);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

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

  const handleExport = async (type) => {
    try {
      setExportError('');
      setExporting(true);
      const response = await api.get(`/reports/syllabus/${id}/export/${type}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      const ext = type === 'excel' ? 'xlsx' : type;
      link.href = url;
      link.setAttribute('download', `syllabus-${id}-report.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed', e);
      setExportError('Не вдалося експортувати звіт');
    } finally {
      setExporting(false);
      setAnchorEl(null);
    }
  };

  return (
    <>
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction={{ xs:'column', sm:'row' }} justifyContent="space-between" alignItems={{ sm:'center' }} spacing={2}>
          <Box>
            <Typography variant="h4" gutterBottom component="h1">
              {syllabus.title}
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              {syllabus.course.name} ({syllabus.course.code})
            </Typography>
          </Box>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                variant="contained"
                startIcon={<Download />}
                onClick={(e)=> setAnchorEl(e.currentTarget)}
                disabled={exporting}
              >
                {exporting ? 'Експорт...' : 'Експорт'}
              </Button>
              {exporting && <CircularProgress size={24} />}
            </Stack>
            <Menu anchorEl={anchorEl} open={exportOpen} onClose={()=> setAnchorEl(null)}>
              <MenuItem onClick={()=> handleExport('csv')}>CSV</MenuItem>
              <MenuItem onClick={()=> handleExport('excel')}>Excel</MenuItem>
              <MenuItem onClick={()=> handleExport('pdf')}>PDF</MenuItem>
            </Menu>
          </Box>
        </Stack>
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, height: '100%', mb: 3 }}>
            <AnalysisOverview syllabus={syllabus} />
          </Paper>
          <Paper sx={{ p: 2 }}>
            <RecommendationsPanel
              syllabusId={syllabus._id}
              recommendations={syllabus.recommendations || []}
              onChanged={fetchSyllabus}
            />
          </Paper>
          <Paper sx={{ p: 2, mt: 3 }}>
            <GroupedRecommendations syllabus={syllabus} />
          </Paper>
        </Grid>
  <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, mb: 3 }}>
            <AIChallenger syllabus={syllabus} onChallengeUpdate={fetchSyllabus} />
          </Paper>
          <Paper sx={{ p: 2 }}>
            <InteractiveRecommendations syllabus={syllabus} />
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
