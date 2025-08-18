import React, { useMemo } from 'react';
import { Box, Typography, Grid, Chip, Stack, Divider, LinearProgress, Paper } from '@mui/material';

const Metric = ({ label, value, helper }) => (
  <Paper variant="outlined" sx={{ p: 2 }}>
    <Typography variant="overline" color="text.secondary">{label}</Typography>
    <Typography variant="h5">{value}</Typography>
    {helper && (
      <Typography variant="caption" color="text.secondary">{helper}</Typography>
    )}
  </Paper>
);

const Bullet = ({ children }) => (
  <Typography variant="body2" sx={{ mb: 0.5 }}>• {children}</Typography>
);

const AnalysisOverview = ({ syllabus }) => {
  const stats = useMemo(() => {
    const recs = Array.isArray(syllabus.recommendations) ? syllabus.recommendations : [];
    const accepted = recs.filter(r => r.status === 'accepted').length;
    const rejected = recs.filter(r => r.status === 'rejected').length;
    const commented = recs.filter(r => r.status === 'commented').length;
    const pending = recs.filter(r => r.status === 'pending').length;
    const total = recs.length;
    const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

    const loa = syllabus.analysis?.learningObjectivesAlignment || {};
    const loaScore = loa.score || loa.overallScore || 0;
    const aligned = (loa.alignedObjectives || []).length;
    const missing = (loa.missingObjectives || []).length;

    const practicalityScore = Math.round((
      (syllabus.structure?.completenessScore || 0) * 0.3 +
      (syllabus.analysis?.templateCompliance?.score || 0) * 0.3 +
      Math.min(100, (syllabus.practicalChallenge?.aiSuggestions?.length || 0) * 10) * 0.4
    ));

    const suggestedImprovements = [];
    if ((syllabus.analysis?.templateCompliance?.missingElements || []).length > 0) {
      suggestedImprovements.push('Додати відсутні елементи шаблону силабусу.');
    }
    if (loaScore < 75 || missing > 0) {
      suggestedImprovements.push('Посилити відповідність ILO: закрити прогалини та оновити мапу оцінювання.');
    }
    if ((syllabus.analysis?.studentClusterAnalysis?.suggestedCases || []).length < 3) {
      suggestedImprovements.push('Розширити українську кейс-базу та прив’язку до кластерів студентів.');
    }
    if ((syllabus.practicalChallenge?.aiSuggestions || []).length === 0) {
      suggestedImprovements.push('Додати інтерактивні активності (дискусії, групові вправи, peer-to-peer).');
    }

    return {
      total, accepted, rejected, commented, pending, acceptanceRate,
      loaScore, aligned, missing,
      practicalityScore: Math.max(0, Math.min(100, practicalityScore)),
      suggestedImprovements
    };
  }, [syllabus]);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Підсумок аналізу
      </Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={3}><Metric label="Рекомендацій всього" value={stats.total} /></Grid>
        <Grid item xs={12} sm={6} md={3}><Metric label="Прийнято" value={stats.accepted} helper={`Питома вага: ${stats.acceptanceRate}%`} /></Grid>
        <Grid item xs={12} sm={6} md={3}><Metric label="Відхилено" value={stats.rejected} /></Grid>
        <Grid item xs={12} sm={6} md={3}><Metric label="На розгляді/З коментарем" value={`${stats.pending}/${stats.commented}`} /></Grid>
      </Grid>

      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1">Відповідність ILO (MBA outcomes)</Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, mb: 1 }}>
          <Chip label={`Score: ${stats.loaScore}`} color={stats.loaScore >= 80 ? 'success' : stats.loaScore >= 60 ? 'warning' : 'error'} size="small" />
          <Chip label={`Покрито: ${stats.aligned}`} size="small" />
          <Chip label={`Прогалини: ${stats.missing}`} size="small" />
        </Stack>
        <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, stats.loaScore))} sx={{ height: 8, borderRadius: 1 }} />
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1">Оцінка практичності та інтерактивності</Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, mb: 1 }}>
          <Chip label={`Практичність: ${stats.practicalityScore}/100`} color={stats.practicalityScore >= 75 ? 'success' : stats.practicalityScore >= 55 ? 'warning' : 'error'} size="small" />
          <Chip label={`AI-ідеї: ${syllabus.practicalChallenge?.aiSuggestions?.length || 0}`} size="small" />
          <Chip label={`Кейси: ${syllabus.analysis?.studentClusterAnalysis?.suggestedCases?.length || 0}`} size="small" />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Оцінка базується на заповненості структури, відповідності шаблону та кількості інтерактивних ідей/кейсів.
        </Typography>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box>
        <Typography variant="subtitle1">Пропозиції щодо потенційних покращень</Typography>
        {(stats.suggestedImprovements.length > 0) ? (
          <Box sx={{ mt: 1 }}>
            {stats.suggestedImprovements.map((s, i) => (
              <Bullet key={i}>{s}</Bullet>
            ))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Значущих прогалин не виявлено. Рекомендується продовжувати моніторинг зворотного зв’язку студентів.
          </Typography>
        )}
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box>
        <Typography variant="subtitle1">Загальне самарі змін</Typography>
        <Bullet>Прийнято: {stats.accepted} • Відхилено: {stats.rejected} • З коментарями: {stats.commented} • На розгляді: {stats.pending}</Bullet>
        <Bullet>Рівень відповідності outcomes (ILO): {stats.loaScore}/100</Bullet>
        <Bullet>Практичність/інтерактивність: {stats.practicalityScore}/100</Bullet>
      </Box>
    </Box>
  );
};

export default AnalysisOverview;
