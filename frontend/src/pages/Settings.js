import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import { useAuth } from '../contexts/AuthContext';
import { useThemeMode } from '../contexts/ThemeContext';
import api from '../services/api';

const Settings = () => {
  const { user } = useAuth();
  const { setMode } = useThemeMode();
  const [theme, setTheme] = useState(user?.settings?.theme || 'system');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const save = async () => {
    setMsg(''); setErr('');
    try {
  const res = await api.user.updateSettings({ theme });
      if (res.data?.settings) setMsg("Settings saved");
  // Apply theme immediately without waiting for a fresh profile fetch
  setMode(theme);
    } catch (e) {
      setErr(e.response?.data?.message || "Could not save settings");
    }
  };

  return (
    <Box p={2}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={700} gutterBottom>Appearance</Typography>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        {msg && <Alert severity="success" sx={{ mb: 2 }}>{msg}</Alert>}
        <FormControl fullWidth sx={{ maxWidth: 320 }}>
          <InputLabel>Theme</InputLabel>
          <Select label="Theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
            <MenuItem value="system">System</MenuItem>
            <MenuItem value="light">Light</MenuItem>
            <MenuItem value="dark">Dark</MenuItem>
          </Select>
        </FormControl>
        <Box mt={2}>
          <Button variant="contained" onClick={save}>Save</Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default Settings;
