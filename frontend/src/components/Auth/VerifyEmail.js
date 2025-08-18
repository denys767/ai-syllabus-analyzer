import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Box, Paper, Typography, Alert, Button, TextField } from '@mui/material';
import api from '../../services/api';

const VerifyEmail = () => {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('pending'); // pending | success | error
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Відсутній токен підтвердження.');
        return;
      }
      try {
        await api.auth.verifyEmail(token);
        setStatus('success');
        setMessage('Email успішно підтверджено. Тепер ви можете увійти.');
      } catch (e) {
        setStatus('error');
        setMessage(e.response?.data?.message || 'Не вдалося підтвердити email.');
      }
    };
    run();
  }, [token]);

  const resend = async () => {
    setStatus('pending');
    try {
      await api.auth.resendVerification(email);
      setStatus('success');
      setMessage('Якщо email існує, ми надішлемо новий лист підтвердження.');
    } catch (e) {
      setStatus('error');
      setMessage(e.response?.data?.message || 'Помилка повторного надсилання.');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
      <Paper elevation={8} sx={{ maxWidth: 520, width: '100%', p: 4, borderRadius: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Підтвердження електронної пошти
        </Typography>

        {status === 'pending' && <Alert severity="info" sx={{ mb: 2 }}>Обробка...</Alert>}
        {status === 'success' && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
        {status === 'error' && <Alert severity="error" sx={{ mb: 2 }}>{message}</Alert>}

        {status !== 'success' && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Не отримали лист? Введіть ваш email для повторного надсилання.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField fullWidth type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button variant="outlined" onClick={resend}>Надіслати ще раз</Button>
            </Box>
          </Box>
        )}

        <Box sx={{ mt: 3 }}>
          <Typography variant="body2">
            <Link to="/login" style={{ color: '#1976d2', fontWeight: 600 }}>Перейти до входу</Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default VerifyEmail;
