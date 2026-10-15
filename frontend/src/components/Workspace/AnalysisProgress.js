import React from 'react';
import { Alert, Box, Button, LinearProgress, Step, StepLabel, Stepper, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ANALYSIS_STAGES } from './constants';

// Стани аналізу: етапи, помилка або перевищення часу очікування.
const AnalysisProgress = ({ stage, error, failed, timedOut, busy, onRetry }) => {
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'));
  if (failed || timedOut) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 6, gap: 2 }}>
        <Alert severity="error" sx={{ maxWidth: 560 }}>
          {failed
            ? `Під час аналізу силабуса сталася помилка.${error ? ` ${error}` : ''}`
            : 'Аналіз триває надто довго. Спробуйте повторити.'}
        </Alert>
        <Button variant="contained" onClick={onRetry} disabled={busy}>Повторити аналіз</Button>
      </Box>
    );
  }
  const index = ANALYSIS_STAGES.findIndex((s) => s.key === stage);
  const last = ANALYSIS_STAGES.length - 1;
  // «Готово» — усі етапи завершені; невідомий етап (ще не повідомлено) — індикатор без значення
  const activeStep = index === last ? ANALYSIS_STAGES.length : Math.max(0, index);
  const percent = index < 0 ? 0 : Math.round((index / last) * 100);
  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', mt: 6, px: 2 }}>
      <Typography variant="h6" align="center" gutterBottom>Аналізуємо ваш силабус…</Typography>
      <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
        Це може тривати кілька хвилин. Сторінку можна залишити відкритою.
      </Typography>
      <Stepper activeStep={activeStep} alternativeLabel={!narrow} orientation={narrow ? 'vertical' : 'horizontal'} sx={{ mb: 3 }}>
        {ANALYSIS_STAGES.map((s) => (
          <Step key={s.key}><StepLabel>{s.label}</StepLabel></Step>
        ))}
      </Stepper>
      {index < 0
        ? <LinearProgress />
        : <LinearProgress variant="determinate" value={percent} aria-label="Прогрес аналізу" />}
    </Box>
  );
};

export default AnalysisProgress;
