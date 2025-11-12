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
      if (!res.success) throw new Error(res.error || 'Request error');
      setSuccess('If the email exists, we have sent password recovery instructions.');
    } catch (err) {
      setError(err.message || 'Request error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (password.length < 6) {
      setError('Password must contain at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await resetPassword(existingToken, password);
      if (!res.success) throw new Error(res.error || 'Password reset error');
      setSuccess('Password successfully changed. You can now log in.');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err.message || 'Password reset error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
      <Paper elevation={8} sx={{ maxWidth: 480, width: '100%', p: 4, borderRadius: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {mode === 'request' ? 'Password Recovery' : 'Password Reset'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {mode === 'request' ? 'Enter your email and we will send instructions' : 'Enter new password'}
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        {mode === 'request' ? (
          <form onSubmit={handleRequest}>
            <TextField fullWidth type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required sx={{ mb: 2 }} />
            <Button type="submit" fullWidth variant="contained" disabled={loading}>
              {loading ? 'Sending...' : 'Send Instructions'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleReset}>
            <TextField fullWidth type="password" label="New Password" value={password} onChange={(e) => setPassword(e.target.value)} required sx={{ mb: 2 }} />
            <TextField fullWidth type="password" label="Confirm Password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required sx={{ mb: 2 }} />
            {password && (
              <Box sx={{ mb: 2 }}>
                <LinearProgress variant="determinate" value={Math.min(100, password.length * 10)} />
                <Typography variant="caption" color="text.secondary">Password strength: {Math.min(100, password.length * 10)}%</Typography>
              </Box>
            )}
            <Button type="submit" fullWidth variant="contained" disabled={loading}>
              {loading ? 'Saving...' : 'Save Password'}
            </Button>
          </form>
        )}
      </Paper>
    </Box>
  );
};

export default ResetPassword;
