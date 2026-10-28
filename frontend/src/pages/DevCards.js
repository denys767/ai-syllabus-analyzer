import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import Stack from '@mui/material/Stack';
import { ThemeProvider } from '@mui/material/styles';
import { buildTheme } from '../contexts/ThemeContext';
import { createMockClient, MOCK_IDS } from '../mocks/chatV5';
import ProfessorTutorWorkspace from './ProfessorTutorWorkspace';

// Інтерактивна галерея v5: справжній hook і картки на ізольованому мок-клієнті без авторизації.
export default function DevCards() {
  const [client, setClient] = useState(() => createMockClient());
  const [id, setId] = useState(MOCK_IDS.upload);
  const [dark, setDark] = useState(false);
  const [epoch, setEpoch] = useState(0);
  return <ThemeProvider theme={buildTheme(dark ? 'dark' : 'light')}><CssBaseline />
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" spacing={1} sx={{ p: 1 }} useFlexGap flexWrap="wrap">
        <Button onClick={() => setId(MOCK_IDS.upload)}>Risk Management · draft</Button>
        <Button onClick={() => setId(MOCK_IDS.scratch)}>Start from scratch · interview</Button>
        <Button onClick={() => setId(MOCK_IDS.rebuild)}>Rebuild v4</Button>
        <Button onClick={() => setDark((v) => !v)}>{dark ? 'Light theme' : 'Dark theme'}</Button>
        <Button onClick={() => { setClient(createMockClient()); setEpoch((n) => n + 1); }}>Reset mock data</Button>
      </Stack>
      <ProfessorTutorWorkspace key={epoch} client={client} mockId={id} />
    </Box>
  </ThemeProvider>;
}
