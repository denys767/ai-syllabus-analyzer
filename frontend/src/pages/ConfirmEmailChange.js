import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
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
    if (!token){ setErr("The confirmation token is missing"); setLoading(false); return; }
    (async ()=>{
      try {
        await api.emailChange.confirm(token);
        setMsg("Your email has been changed. You can return to your profile.");
      } catch (e) {
        setErr(e.response?.data?.message || "Could not confirm the email change");
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="60vh" p={2}>
      <Typography variant="h5" gutterBottom>Confirm email change</Typography>
      {loading && <CircularProgress />}
      {!loading && msg && <Alert severity="success" sx={{ mb: 2 }}>{msg}</Alert>}
      {!loading && err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
      {!loading && (
        <Button variant="contained" onClick={()=> navigate('/profile')}>Return to profile</Button>
      )}
    </Box>
  );
}
