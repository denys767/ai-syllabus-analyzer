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
        setMessage('Missing verification token.');
        return;
      }
      try {
        await api.auth.verifyEmail(token);
        setStatus('success');
        setMessage('Email successfully verified. You can now log in.');
      } catch (e) {
        setStatus('error');
        setMessage(e.response?.data?.message || 'Failed to verify email.');
      }
    };
    run();
  }, [token]);

  const resend = async () => {
    setStatus('pending');
    try {
      await api.auth.resendVerification(email);
      setStatus('success');
      setMessage('If the email exists, we will send a new verification email.');
    } catch (e) {
      setStatus('error');
      setMessage(e.response?.data?.message || 'Resend error.');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
      <Paper elevation={8} sx={{ maxWidth: 520, width: '100%', p: 4, borderRadius: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Email Verification
        </Typography>

        {status === 'pending' && <Alert severity="info" sx={{ mb: 2 }}>Processing...</Alert>}
        {status === 'success' && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
        {status === 'error' && <Alert severity="error" sx={{ mb: 2 }}>{message}</Alert>}

        {status !== 'success' && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Didn't receive the email? Enter your email to resend.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField fullWidth type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button variant="outlined" onClick={resend}>Send Again</Button>
            </Box>
          </Box>
        )}

        <Box sx={{ mt: 3 }}>
          <Typography variant="body2">
            <Link to="/login" style={{ color: '#1976d2', fontWeight: 600 }}>Go to Login</Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default VerifyEmail;
