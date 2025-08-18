import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Box, Paper, TextField, Button, Typography, Alert, LinearProgress } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';

const ResetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { forgotPassword, resetPassword } = useAuth();

  const existingToken = params.get('token');

  const [mode, setMode] = useState(existingToken ? 'reset' : 'request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setMode(existingToken ? 'reset' : 'request');
  }, [existingToken]);

  const handleRequest = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);
    try {
      const res = await forgotPassword(email);
      if (!res.success) throw new Error(res.error || 'Помилка запиту');
      setSuccess('Якщо email існує, ми надіслали інструкції з відновлення паролю.');
    } catch (err) {
      setError(err.message || 'Помилка запиту');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (password.length < 6) {
      setError('Пароль має містити мінімум 6 символів');
      return;
    }
    if (password !== confirm) {
      setError('Паролі не співпадають');
      return;
    }
    setLoading(true);
    try {
      const res = await resetPassword(existingToken, password);
      if (!res.success) throw new Error(res.error || 'Помилка скидання паролю');
      setSuccess('Пароль успішно змінено. Тепер можете увійти.');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err.message || 'Помилка скидання паролю');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
      <Paper elevation={8} sx={{ maxWidth: 480, width: '100%', p: 4, borderRadius: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {mode === 'request' ? 'Відновлення паролю' : 'Скидання паролю'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {mode === 'request' ? 'Введіть ваш email і ми надішлемо інструкції' : 'Введіть новий пароль'}
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        {mode === 'request' ? (
          <form onSubmit={handleRequest}>
            <TextField fullWidth type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required sx={{ mb: 2 }} />
            <Button type="submit" fullWidth variant="contained" disabled={loading}>
              {loading ? 'Надсилання...' : 'Надіслати інструкції'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleReset}>
            <TextField fullWidth type="password" label="Новий пароль" value={password} onChange={(e) => setPassword(e.target.value)} required sx={{ mb: 2 }} />
            <TextField fullWidth type="password" label="Підтвердити пароль" value={confirm} onChange={(e) => setConfirm(e.target.value)} required sx={{ mb: 2 }} />
            {password && (
              <Box sx={{ mb: 2 }}>
                <LinearProgress variant="determinate" value={Math.min(100, password.length * 10)} />
                <Typography variant="caption" color="text.secondary">Надійність паролю: {Math.min(100, password.length * 10)}%</Typography>
              </Box>
            )}
            <Button type="submit" fullWidth variant="contained" disabled={loading}>
              {loading ? 'Збереження...' : 'Зберегти пароль'}
            </Button>
          </form>
        )}
      </Paper>
    </Box>
  );
};

export default ResetPassword;
