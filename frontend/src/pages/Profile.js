import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const lecturerFields = [
  ['name', 'Full name'], ['position', 'Position'], ['email', 'Email'],
  ['officeHours', 'Office hours'], ['assistants', 'Assistants'],
  ['expertise', 'Areas of Expertise'], ['education', 'Education (certificates and degrees)'],
  ['experience', 'Professional Experience'],
];
const lecturerLists = ['expertise', 'education', 'experience'];
const lecturerForm = (profile) => Object.fromEntries(lecturerFields.map(([key]) => [key,
  lecturerLists.includes(key) ? (profile[key] || []).join('\n') : profile[key] || '',
]));

const Profile = () => {
  const { user, updateProfile } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email] = useState(user?.email || '');
  const [newEmail, setNewEmail] = useState('');
  const [emailChangeMsg, setEmailChangeMsg] = useState('');
  const [emailChangeErr, setEmailChangeErr] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [lecturer, setLecturer] = useState(null);
  const [lecturerEditing, setLecturerEditing] = useState(false);
  const [lecturerBusy, setLecturerBusy] = useState(false);
  const [lecturerError, setLecturerError] = useState('');
  const [lecturerMessage, setLecturerMessage] = useState('');
  const [lecturerWarnings, setLecturerWarnings] = useState([]);
  const [savedLecturer, setSavedLecturer] = useState(null);

  useEffect(() => {
    let active = true;
    api.lecturerProfile.get().then(({ data }) => {
      if (!active) return;
      const form = lecturerForm(data.profile);
      setLecturer(form); setSavedLecturer(form); setLecturerWarnings(data.warnings || []);
    }).catch((e) => {
      if (active) setLecturerError(e.response?.data?.message || 'Could not load your lecturer profile.');
    });
    return () => { active = false; };
  }, []);

  const saveLecturer = async (event) => {
    event.preventDefault();
    setLecturerBusy(true); setLecturerError(''); setLecturerMessage('');
    const payload = Object.fromEntries(lecturerFields.map(([key]) => [key, lecturerLists.includes(key)
      ? lecturer[key].split('\n').map((item) => item.trim()).filter(Boolean) : lecturer[key]]));
    try {
      const { data } = await api.lecturerProfile.update(payload);
      const form = lecturerForm(data.profile);
      setLecturer(form); setSavedLecturer(form); setLecturerWarnings(data.warnings || []);
      setLecturerEditing(false); setLecturerMessage(data.message || 'Lecturer profile updated.');
    } catch (e) {
      setLecturerError(e.response?.data?.message || 'Could not save your lecturer profile.');
    } finally {
      setLecturerBusy(false);
    }
  };

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');

  const saveProfile = async () => {
    setLoading(true); setErr(''); setMsg('');
    try {
      const res = await updateProfile({ firstName, lastName, avatarUrl });
      if (!res.success) throw new Error(res.error || "Could not update your profile");
      setMsg("Profile updated.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    setPwdErr(''); setPwdMsg('');
    if (newPassword.length < 6) return setPwdErr("Your new password must contain at least 6 characters");
    if (newPassword !== confirmPassword) return setPwdErr("The passwords do not match");
    try {
      await api.user.changePassword(currentPassword, newPassword);
      setPwdMsg("Password changed");
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e) {
      setPwdErr(e.response?.data?.message || "Could not change your password");
    }
  };

  // Видалення облікового запису
  const [delPwd, setDelPwd] = useState('');
  const [delErr, setDelErr] = useState('');
  const [delMsg, setDelMsg] = useState('');
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = async () => {
    setDelErr(''); setDelMsg('');
    if (!delPwd) return setDelErr("Enter your password to confirm");
    if (!window.confirm("Permanently delete your account? This cannot be undone.")) return;
    try {
      setDeleting(true);
      await api.user.deleteAccount(delPwd);
      setDelMsg("Account deleted. Signing out…");
      setTimeout(()=>{
        localStorage.removeItem('token');
        window.dispatchEvent(new CustomEvent('auth_logout'));
      }, 1200);
    } catch (e) {
      setDelErr(e.response?.data?.message || "Could not delete your account");
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
                <TextField label="First name" fullWidth value={firstName} onChange={(e)=>setFirstName(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Last name" fullWidth value={lastName} onChange={(e)=>setLastName(e.target.value)} />
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
          <Paper component="form" onSubmit={saveLecturer} sx={{ p: 3, mt: 2 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>Lecturer profile</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              These details prefill the Instructor section of new syllabi. Here is your profile. Is it up to date?
            </Typography>
            {lecturerError && <Alert severity="error" sx={{ mb: 2 }}>{lecturerError}</Alert>}
            {lecturerMessage && <Alert severity="success" sx={{ mb: 2 }}>{lecturerMessage}</Alert>}
            {lecturerWarnings.map((warning) => <Alert key={warning} severity="warning" sx={{ mb: 2 }}>{warning}</Alert>)}
            {!lecturer && !lecturerError && <Typography>Loading lecturer profile…</Typography>}
            {lecturer && <>
              <Grid container spacing={2}>
                {lecturerFields.map(([key, label]) => (
                  <Grid key={key} item xs={12}>
                    <TextField
                      label={label} fullWidth value={lecturer[key]}
                      type={key === 'email' ? 'email' : 'text'}
                      multiline={lecturerLists.includes(key) || ['officeHours', 'assistants'].includes(key)}
                      minRows={lecturerLists.includes(key) ? 3 : undefined}
                      helperText={lecturerEditing && lecturerLists.includes(key) ? 'Enter one item per line.' : undefined}
                      InputProps={{ readOnly: !lecturerEditing }}
                      disabled={lecturerBusy}
                      onChange={(e) => setLecturer({ ...lecturer, [key]: e.target.value })}
                    />
                  </Grid>
                ))}
              </Grid>
              <Box mt={2} display="flex" gap={1}>
                {lecturerEditing ? <>
                  <Button type="submit" variant="contained" disabled={lecturerBusy}>Save lecturer profile</Button>
                  <Button disabled={lecturerBusy} onClick={() => { setLecturer(savedLecturer); setLecturerEditing(false); setLecturerError(''); }}>Cancel</Button>
                </> : <>
                  <Button variant="outlined" onClick={() => setLecturerMessage('Your lecturer profile is up to date.')}>Yes, it's up to date</Button>
                  <Button variant="contained" onClick={() => { setLecturerEditing(true); setLecturerMessage(''); }}>Update</Button>
                </>}
              </Box>
            </>}
          </Paper>
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, mb: 2 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>Change email</Typography>
            {emailChangeErr && <Alert severity="error" sx={{ mb: 2 }}>{emailChangeErr}</Alert>}
            {emailChangeMsg && <Alert severity="success" sx={{ mb: 2 }}>{emailChangeMsg}</Alert>}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter your new email address. We will send a confirmation link there to complete the change.
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
                  if (!newEmail) throw new Error("Enter a new email address");
                  const res = await api.emailChange.request(newEmail);
                  setEmailChangeMsg(res.data?.message || "Check your email to confirm the change");
                  setNewEmail('');
                } catch (e) {
                  setEmailChangeErr(e.response?.data?.message || "Could not send confirmation");
                }
              }}
            >Request change</Button>
          </Paper>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>Avatar</Typography>
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar src={avatarUrl} alt="avatar" sx={{ width: 72, height: 72 }} />
              <Typography variant="body2" color="text.secondary">Use an image URL or leave blank to show your initials</Typography>
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
            <Typography variant="h6" fontWeight={700} color="error" gutterBottom>Delete account</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              This cannot be undone. All your syllabi will be deleted.
            </Typography>
            {delErr && <Alert severity="error" sx={{ mb: 2 }}>{delErr}</Alert>}
            {delMsg && <Alert severity="success" sx={{ mb: 2 }}>{delMsg}</Alert>}
            <TextField type="password" label="Password to confirm" fullWidth sx={{ mb: 2 }} value={delPwd} onChange={(e)=>setDelPwd(e.target.value)} />
            <Button variant="contained" color="error" disabled={deleting} onClick={deleteAccount}>Delete account</Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Profile;
