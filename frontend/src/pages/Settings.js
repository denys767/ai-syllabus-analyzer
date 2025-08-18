import React, { useState } from 'react';
import { Box, Paper, Typography, FormControl, InputLabel, Select, MenuItem, Button, Alert } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const Settings = () => {
  const { user } = useAuth();
  const [theme, setTheme] = useState(user?.settings?.theme || 'system');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const save = async () => {
    setMsg(''); setErr('');
    try {
      const res = await api.put('/users/settings', { theme });
      if (res.data?.settings) setMsg('Налаштування збережено');
    } catch (e) {
      setErr(e.response?.data?.message || 'Помилка збереження налаштувань');
    }
  };

  return (
    <Box p={2}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={700} gutterBottom>Налаштування інтерфейсу</Typography>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        {msg && <Alert severity="success" sx={{ mb: 2 }}>{msg}</Alert>}
        <FormControl fullWidth sx={{ maxWidth: 320 }}>
          <InputLabel>Тема</InputLabel>
          <Select label="Тема" value={theme} onChange={(e) => setTheme(e.target.value)}>
            <MenuItem value="system">Системна</MenuItem>
            <MenuItem value="light">Світла</MenuItem>
            <MenuItem value="dark">Темна</MenuItem>
          </Select>
        </FormControl>
        <Box mt={2}>
          <Button variant="contained" onClick={save}>Зберегти</Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default Settings;
