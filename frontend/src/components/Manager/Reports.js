import React from 'react';
import { Box, Typography } from '@mui/material';
// Deprecated heavy analytics view replaced with per‑syllabus report catalogue (to be implemented)
export default function Reports(){
  return <Box sx={{ p:3 }}><Typography variant="h5" gutterBottom>Системна аналітика</Typography><Typography variant="body2" color="text.secondary">Агреговані графіки та відсоткові оцінки вимкнено. Перейдіть до розділу "Звіти" щоб переглянути детальну інформацію по кожному силабусу.</Typography></Box>;
}
