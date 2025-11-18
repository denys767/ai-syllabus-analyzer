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
      const res = await updateProfile({ firstName, lastName, avatarUrl });
      if (!res.success) throw new Error(res.error || 'Profile update error');
      setMsg('Profile updated.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    setPwdErr(''); setPwdMsg('');
    if (!user?.isVerified) return setPwdErr('First verify email to change password');
    if (newPassword.length < 6) return setPwdErr('New password must contain at least 6 characters');
    if (newPassword !== confirmPassword) return setPwdErr('Passwords do not match');
    try {
      await api.user.changePassword(currentPassword, newPassword);
      setPwdMsg('Password changed successfully');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e) {
      setPwdErr(e.response?.data?.message || 'Password change error');
    }
  };

  // Account deletion
  const [delPwd, setDelPwd] = useState('');
  const [delErr, setDelErr] = useState('');
  const [delMsg, setDelMsg] = useState('');
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = async () => {
    setDelErr(''); setDelMsg('');
    if (!delPwd) return setDelErr('Enter password for confirmation');
    if (!window.confirm('Are you sure you want to permanently delete your account? This action cannot be undone.')) return;
    try {
      setDeleting(true);
      await api.user.deleteAccount(delPwd);
      setDelMsg('Account deleted. You will be logged out...');
      setTimeout(()=>{
        localStorage.removeItem('token');
        window.dispatchEvent(new CustomEvent('auth_logout'));
      }, 1200);
    } catch (e) {
      setDelErr(e.response?.data?.message || 'Account deletion error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box p={2}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>Profile</Typography>
            {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
            {msg && <Alert severity="success" sx={{ mb: 2 }}>{msg}</Alert>}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField label="First Name" fullWidth value={firstName} onChange={(e)=>setFirstName(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Last Name" fullWidth value={lastName} onChange={(e)=>setLastName(e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <TextField type="email" label="Current email" fullWidth value={email} disabled />
              </Grid>
              <Grid item xs={12}>
                <TextField label="Avatar URL" fullWidth value={avatarUrl} onChange={(e)=>setAvatarUrl(e.target.value)} />
              </Grid>
            </Grid>
            <Box mt={2} display="flex" gap={1}>
              <Button variant="contained" onClick={saveProfile} disabled={loading}>Save</Button>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, mb: 2 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>Change email</Typography>
            {emailChangeErr && <Alert severity="error" sx={{ mb: 2 }}>{emailChangeErr}</Alert>}
            {emailChangeMsg && <Alert severity="success" sx={{ mb: 2 }}>{emailChangeMsg}</Alert>}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter a new address. We will send a confirmation link to it. After confirmation, your email will be changed.
            </Typography>
            <TextField
              type="email"
              label="New email address"
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
                  if (!newEmail) throw new Error('Specify new email address');
                  const res = await api.emailChange.request(newEmail);
                  setEmailChangeMsg(res.data?.message || 'Check your email for confirmation');
                  setNewEmail('');
                } catch (e) {
                  setEmailChangeErr(e.response?.data?.message || 'Failed to send confirmation');
                }
              }}
            >Request change</Button>
          </Paper>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>Avatar</Typography>
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar src={avatarUrl} alt="avatar" sx={{ width: 72, height: 72 }} />
              <Typography variant="body2" color="text.secondary">Link to image or leave empty for initials</Typography>
            </Box>
          </Paper>

          <Divider sx={{ my: 2 }} />

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>Change password</Typography>
            {pwdErr && <Alert severity="error" sx={{ mb: 2 }}>{pwdErr}</Alert>}
            {pwdMsg && <Alert severity="success" sx={{ mb: 2 }}>{pwdMsg}</Alert>}
            <TextField type="password" label="Current password" fullWidth sx={{ mb: 2 }} value={currentPassword} onChange={(e)=>setCurrentPassword(e.target.value)} />
            <TextField type="password" label="New password" fullWidth sx={{ mb: 2 }} value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} />
            <TextField type="password" label="Confirm password" fullWidth sx={{ mb: 2 }} value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} />
            <Button variant="outlined" onClick={changePassword}>Change password</Button>
          </Paper>

          <Divider sx={{ my: 2 }} />

          <Paper sx={{ p: 3, border: '1px solid', borderColor: 'error.main' }}>
            <Typography variant="h6" fontWeight={700} color="error" gutterBottom>Account deletion</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              This action is irreversible and will delete all your syllabi and practical ideas.
            </Typography>
            {delErr && <Alert severity="error" sx={{ mb: 2 }}>{delErr}</Alert>}
            {delMsg && <Alert severity="success" sx={{ mb: 2 }}>{delMsg}</Alert>}
            <TextField type="password" label="Password for confirmation" fullWidth sx={{ mb: 2 }} value={delPwd} onChange={(e)=>setDelPwd(e.target.value)} />
            <Button variant="contained" color="error" disabled={deleting} onClick={deleteAccount}>Delete account</Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Profile;
