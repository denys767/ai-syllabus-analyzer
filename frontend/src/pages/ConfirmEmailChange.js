import React, { useEffect, useState } from 'react';
import { Box, CircularProgress, Alert, Typography, Button } from '@mui/material';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function ConfirmEmailChange(){
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(()=>{
    const token = params.get('token');
    if (!token){ setErr('Відсутній токен підтвердження'); setLoading(false); return; }
    (async ()=>{
      try {
        await api.emailChange.confirm(token);
        setMsg('Email успішно змінено. Можете повернутися до профілю.');
      } catch (e) {
        setErr(e.response?.data?.message || 'Не вдалося підтвердити зміну email');
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="60vh" p={2}>
      <Typography variant="h5" gutterBottom>Підтвердження зміни email</Typography>
      {loading && <CircularProgress />}
      {!loading && msg && <Alert severity="success" sx={{ mb: 2 }}>{msg}</Alert>}
      {!loading && err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
      {!loading && (
        <Button variant="contained" onClick={()=> navigate('/profile')}>Повернутись до профілю</Button>
      )}
    </Box>
  );
}
