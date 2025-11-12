import React from 'react';
import { Box, Typography } from '@mui/material';
// Deprecated heavy analytics view replaced with per‑syllabus report catalogue (to be implemented)
export default function Reports(){
  return <Box sx={{ p:3 }}><Typography variant="h5" gutterBottom>System Analytics</Typography><Typography variant="body2" color="text.secondary">Aggregated charts and percentage ratings are disabled. Go to the "Reports" section to view detailed information for each syllabus.</Typography></Box>;
}
