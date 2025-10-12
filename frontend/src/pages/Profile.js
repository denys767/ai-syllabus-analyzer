import React, { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, Grid, Avatar, Divider, Alert } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const Profile = () => {
  const { user, updateProfile } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [newEmail, setNewEmail] = useState('');
  const [emailChangeMsg, setEmailChangeMsg] = useState('');
  const [emailChangeErr, setEmailChangeErr] = useState('');
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
  const res = await updateProfile({ firstName, lastName, department, avatarUrl });
      if (!res.success) throw new Error(res.error || 'Помилка оновлення профілю');
  setMsg('Профіль оновлено.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    setPwdErr(''); setPwdMsg('');
    if (!user?.isVerified) return setPwdErr('Спочатку підтвердіть email для зміни пароля');
    if (newPassword.length < 6) return setPwdErr('Новий пароль має містити мінімум 6 символів');
    if (newPassword !== confirmPassword) return setPwdErr('Паролі не співпадають');
    try {
      await api.user.changePassword(currentPassword, newPassword);
      setPwdMsg('Пароль змінено успішно');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e) {
      setPwdErr(e.response?.data?.message || 'Помилка зміни паролю');
    }
  };

  // Account deletion
  const [delPwd, setDelPwd] = useState('');
  const [delErr, setDelErr] = useState('');
  const [delMsg, setDelMsg] = useState('');
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = async () => {
    setDelErr(''); setDelMsg('');
    if (!delPwd) return setDelErr('Введіть пароль для підтвердження');
    if (!window.confirm('Ви впевнені, що хочете назавжди видалити акаунт? Дію не можна відмінити.')) return;
    try {
      setDeleting(true);
      await api.user.deleteAccount(delPwd);
      setDelMsg('Акаунт видалено. Ви будете виведені...');
      setTimeout(()=>{
        localStorage.removeItem('token');
        window.dispatchEvent(new CustomEvent('auth_logout'));
      }, 1200);
    } catch (e) {
      setDelErr(e.response?.data?.message || 'Помилка видалення акаунта');
    } finally {
      setDeleting(false);
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
                <TextField type="email" label="Поточний email" fullWidth value={email} disabled />
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
          <Paper sx={{ p: 3, mb: 2 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>Зміна email</Typography>
            {emailChangeErr && <Alert severity="error" sx={{ mb: 2 }}>{emailChangeErr}</Alert>}
            {emailChangeMsg && <Alert severity="success" sx={{ mb: 2 }}>{emailChangeMsg}</Alert>}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Вкажіть нову адресу. Ми надішлемо на неї лист із посиланням. Після підтвердження ваш email буде змінено.
            </Typography>
            <TextField
              type="email"
              label="Нова адреса email"
              fullWidth
              sx={{ mb: 2 }}
              value={newEmail}
              onChange={(e)=>setNewEmail(e.target.value)}
            />
            <Button
              variant="outlined"
              onClick={async ()=>{
                setEmailChangeErr(''); setEmailChangeMsg('');
                try {
                  if (!newEmail) throw new Error('Вкажіть нову адресу email');
                  const res = await api.emailChange.request(newEmail);
                  setEmailChangeMsg(res.data?.message || 'Перевірте пошту для підтвердження');
                  setNewEmail('');
                } catch (e) {
                  setEmailChangeErr(e.response?.data?.message || 'Не вдалося надіслати підтвердження');
                }
              }}
            >Запросити зміну</Button>
          </Paper>
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

          <Divider sx={{ my: 2 }} />

          <Paper sx={{ p: 3, border: '1px solid', borderColor: 'error.main' }}>
            <Typography variant="h6" fontWeight={700} color="error" gutterBottom>Видалення акаунта</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Ця дія незворотня і видалить всі ваші силлабуси та практичні ідеї.
            </Typography>
            {delErr && <Alert severity="error" sx={{ mb: 2 }}>{delErr}</Alert>}
            {delMsg && <Alert severity="success" sx={{ mb: 2 }}>{delMsg}</Alert>}
            <TextField type="password" label="Пароль для підтвердження" fullWidth sx={{ mb: 2 }} value={delPwd} onChange={(e)=>setDelPwd(e.target.value)} />
            <Button variant="contained" color="error" disabled={deleting} onClick={deleteAccount}>Видалити акаунт</Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Profile;
