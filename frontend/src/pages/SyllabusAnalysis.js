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
  const [isPolling, setIsPolling] = useState(false);

  const fetchSyllabus = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await api.get(`/syllabus/${id}`);
      setSyllabus(response.data);
      setError(null);
      
      // Автоматично вмикаємо polling якщо статус "processing"
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

  // Початкове завантаження
  useEffect(() => {
    fetchSyllabus();
  }, [fetchSyllabus]);

  // Динамічний polling для статусу аналізу
  useEffect(() => {
    if (!isPolling || !id) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await api.syllabus.getSyllabusStatus(id);
        const newStatus = statusResponse.data.status;
        
        // Оновлюємо статус без повного перезавантаження
        setSyllabus(prev => prev ? { ...prev, status: newStatus } : prev);
        
        // Якщо аналіз завершено, завантажуємо повні дані та вимикаємо polling
        if (newStatus === 'analyzed' || newStatus === 'error') {
          setIsPolling(false);
          await fetchSyllabus(true); // silent reload для отримання рекомендацій
          
          if (newStatus === 'error') {
            setError(statusResponse.data.error || 'Помилка під час аналізу силабусу');
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
        // Не зупиняємо polling при одиночній помилці
      }
    }, 3000); // Перевірка кожні 3 секунди
    
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
            
            {/* Динамічний статус аналізу */}
            {syllabus.status === 'processing' && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="info.main">
                  Аналіз у процесі... Рекомендації з'являться автоматично після завершення
                </Typography>
              </Stack>
            )}
            
            {syllabus.status === 'analyzed' && (
              <Alert severity="success" sx={{ mt: 2 }}>
                ✅ Аналіз завершено! Перегляньте рекомендації нижче.
              </Alert>
            )}
            
            {syllabus.status === 'error' && (
              <Alert severity="error" sx={{ mt: 2 }}>
                ❌ Помилка під час аналізу. Спробуйте перезавантажити сторінку.
              </Alert>
            )}
            
            {syllabus.status === 'analyzed' && (
              <Typography variant="body2" color="text.secondary" sx={{ mt:1 }}>
                Прийміть потрібні рекомендації, натисніть «Редагувати силабус з AI» і дочекайтесь PDF зі змінами.
              </Typography>
            )}
          </Box>
        </Stack>
      </Paper>

      {/* Показуємо рекомендації тільки після завершення аналізу */}
      {syllabus.status === 'analyzed' && (
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
        </Grid>
      )}
      
      {/* Показуємо placeholder під час обробки */}
      {syllabus.status === 'processing' && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress size={60} sx={{ mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Аналізуємо ваш силабус...
          </Typography>
          <Typography variant="body2" color="text.secondary">
            AI обробляє текст, генерує рекомендації та перевіряє відповідність до програми MBA.
            Це може зайняти до 2 хвилин.
          </Typography>
        </Paper>
      )}
  </Container>
  </>
  );
};

export default SyllabusAnalysis;
