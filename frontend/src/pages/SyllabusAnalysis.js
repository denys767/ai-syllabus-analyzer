import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, CircularProgress, Alert, Container, Paper, Grid, Stack } from '@mui/material';
import api from '../services/api';
import RecommendationsPanel from '../components/Syllabus/RecommendationsPanel';
import InstructorReport from '../components/Syllabus/InstructorReport';
import AIChallenger from '../components/Syllabus/AIChallenger';

const SyllabusAnalysis = () => {
  const { id } = useParams();
  const [syllabus, setSyllabus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(false);

  const fetchSyllabus = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await api.get(`/syllabus/${id}`);
      setSyllabus(response.data);
      setError(null);
      
      // Automatically enable polling if status is "processing"
      if (response.data.status === 'processing') {
        setIsPolling(true);
      } else if (response.data.status === 'analyzed' || response.data.status === 'error') {
        setIsPolling(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch syllabus data.');
      console.error(err);
      setIsPolling(false);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  // Initial loading
  useEffect(() => {
    fetchSyllabus();
  }, [fetchSyllabus]);

  // Dynamic polling for analysis status
  useEffect(() => {
    if (!isPolling || !id) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await api.syllabus.getSyllabusStatus(id);
        const newStatus = statusResponse.data.status;
        
        // Update status without full reload
        setSyllabus(prev => prev ? { ...prev, status: newStatus } : prev);
        
        // If analysis is complete, load full data and disable polling
        if (newStatus === 'analyzed' || newStatus === 'error') {
          setIsPolling(false);
          await fetchSyllabus(true); // silent reload to get recommendations
          
          if (newStatus === 'error') {
            setError(statusResponse.data.error || 'Error during syllabus analysis');
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
        // Don't stop polling on single error
      }
    }, 3000); // Check every 3 seconds
    
    return () => clearInterval(pollInterval);
  }, [isPolling, id, fetchSyllabus]);

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
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" gutterBottom component="h1">{syllabus.title}</Typography>
            <Typography variant="subtitle1" color="text.secondary">{syllabus.course.name} ({syllabus.course.code})</Typography>
            
            {/* Dynamic analysis status */}
            {syllabus.status === 'processing' && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="info.main">
                  Analysis in progress... Recommendations will appear automatically after completion
                </Typography>
              </Stack>
            )}
            
            {syllabus.status === 'analyzed' && (
              <Alert severity="success" sx={{ mt: 2 }}>
                Analysis completed. View recommendations below.
              </Alert>
            )}
            
            {syllabus.status === 'error' && (
              <Alert severity="error" sx={{ mt: 2 }}>
                ❌ Error during analysis. Try refreshing the page.
              </Alert>
            )}
            
            {syllabus.status === 'analyzed' && (
              <Paper
                elevation={0}
                sx={{
                  mt: 2,
                  p: 2,
                  border: '1px solid',
                  borderColor: 'primary.main',
                  bgcolor: 'primary.light',
                  color: 'primary.contrastText'
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                  User Instructions:
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  1. Answer AI Challenger questions.
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  2. Read the scores of your learning outcomes and practicality. Accept the needed recommendations ("Practicality" reccomendations are made after ai-challenger has been used). Refer to Documents tab to see which learning outcomes refer to its number (LO1, LO2 ...)
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  3. Click "Edit syllabus with AI" and wait for the PDF with changes.
                </Typography>
              </Paper>
            )}
          </Box>
        </Stack>
      </Paper>

      {/* Show recommendations only after analysis completion */}
      {syllabus.status === 'analyzed' && (
        <>
          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <Paper sx={{ p: 2 }}>
                <RecommendationsPanel
                  syllabusId={syllabus._id}
                  syllabus={syllabus}
                  recommendations={syllabus.recommendations || []}
                  onChanged={() => fetchSyllabus(true)}
                />
              </Paper>
            </Grid>
            
            {/* AI Challenger Section */}
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2 }}>
                <AIChallenger 
                  syllabus={syllabus}
                  onChallengeUpdate={() => fetchSyllabus(true)}
                  onNewRecommendations={(newRecs) => {
                    // Refresh syllabus to get new recommendations
                    fetchSyllabus(true);
                  }}
                />
              </Paper>
            </Grid>
          </Grid>
          
          {/* Instructor Report Section */}
          <InstructorReport syllabus={syllabus} />
        </>
      )}
      
      {/* Show placeholder during processing */}
      {syllabus.status === 'processing' && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress size={60} sx={{ mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Analyzing your syllabus...
          </Typography>
          <Typography variant="body2" color="text.secondary">
            AI processes the text, generates recommendations and checks compliance with the MBA program.
            This may take up to 2 minutes.
          </Typography>
        </Paper>
      )}
  </Container>
  </>
  );
};

export default SyllabusAnalysis;
