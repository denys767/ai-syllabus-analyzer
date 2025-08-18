import React, { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, Grid, Avatar, Divider, Alert } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const Profile = () => {
  const { user, updateProfile } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');

  const saveProfile = async () => {
    setLoading(true); setErr(''); setMsg('');
    try {
      const res = await updateProfile({ firstName, lastName, department, avatarUrl, email });
      if (!res.success) throw new Error(res.error || 'Помилка оновлення профілю');
      setMsg('Профіль оновлено. Якщо ви змінили email, підтвердьте його через лист.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    setPwdErr(''); setPwdMsg('');
    if (newPassword.length < 6) return setPwdErr('Новий пароль має містити мінімум 6 символів');
    if (newPassword !== confirmPassword) return setPwdErr('Паролі не співпадають');
    try {
      await api.put('/users/change-password', { currentPassword, newPassword });
      setPwdMsg('Пароль змінено успішно');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e) {
      setPwdErr(e.response?.data?.message || 'Помилка зміни паролю');
    }
  };

  return (
    <Box p={2}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>Профіль</Typography>
            {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
            {msg && <Alert severity="success" sx={{ mb: 2 }}>{msg}</Alert>}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField label="Ім'я" fullWidth value={firstName} onChange={(e)=>setFirstName(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Прізвище" fullWidth value={lastName} onChange={(e)=>setLastName(e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <TextField type="email" label="Email" fullWidth value={email} onChange={(e)=>setEmail(e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <TextField label="Факультет/Відділ" fullWidth value={department} onChange={(e)=>setDepartment(e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <TextField label="Avatar URL" fullWidth value={avatarUrl} onChange={(e)=>setAvatarUrl(e.target.value)} />
              </Grid>
            </Grid>
            <Box mt={2} display="flex" gap={1}>
              <Button variant="contained" onClick={saveProfile} disabled={loading}>Зберегти</Button>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>Аватар</Typography>
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar src={avatarUrl} alt="avatar" sx={{ width: 72, height: 72 }} />
              <Typography variant="body2" color="text.secondary">Посилання на зображення або залиште порожнім для ініціалів</Typography>
            </Box>
          </Paper>

          <Divider sx={{ my: 2 }} />

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>Зміна паролю</Typography>
            {pwdErr && <Alert severity="error" sx={{ mb: 2 }}>{pwdErr}</Alert>}
            {pwdMsg && <Alert severity="success" sx={{ mb: 2 }}>{pwdMsg}</Alert>}
            <TextField type="password" label="Поточний пароль" fullWidth sx={{ mb: 2 }} value={currentPassword} onChange={(e)=>setCurrentPassword(e.target.value)} />
            <TextField type="password" label="Новий пароль" fullWidth sx={{ mb: 2 }} value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} />
            <TextField type="password" label="Підтвердити пароль" fullWidth sx={{ mb: 2 }} value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} />
            <Button variant="outlined" onClick={changePassword}>Змінити пароль</Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Profile;
