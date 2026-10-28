import React, { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloudUpload from '@mui/icons-material/CloudUpload';
import { useDropzone } from 'react-dropzone';
import client from '../../services/workspaceClient';
import { describeError } from '../../utils/apiError';
import { S } from '../../strings';

const ACCEPTED = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'], 'application/pdf': ['.pdf'],
};
const EmptyState = ({ onUploaded }) => {
  const [mode, setMode] = useState(null);
  const [title, setTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [programId, setProgramId] = useState('');
  const [programCode, setProgramCode] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    client.references.programs().then(({ data }) => { if (active) setPrograms(Array.isArray(data) ? data : []); })
      .catch(async (err) => { const info = await describeError(err, S.errLoadPrograms); if (active) setError(info.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const editions = programs.find((p) => p.id === programId)?.editions || [];
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPTED, maxSize: 10 * 1024 * 1024, multiple: false, disabled: busy,
    onDrop: (files) => { if (files[0]) { setFile(files[0]); setError(''); if (!title) setTitle(files[0].name.replace(/\.[^.]+$/, '')); } },
    onDropRejected: () => setError('Choose one DOCX, DOC or PDF file smaller than 10 MB.'),
  });
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return setError(S.errCourseTitle);
    if (!programId) return setError(S.errProgram);
    if (editions.length && !programCode) return setError(S.errEdition);
    if (mode === 'upload' && !file) return setError('Choose a draft file.');
    setBusy(true); setError('');
    try {
      let response;
      if (mode === 'scratch') response = await client.syllabus.create({ title: title.trim(), programId, programCode: programCode || programs.find((p) => p.id === programId)?.code, ...(courseCode.trim() ? { courseCode: courseCode.trim() } : {}) });
      else {
        const fd = new FormData();
        fd.append('syllabus', file); fd.append('courseName', title.trim()); fd.append('programId', programId); fd.append('programCode', programCode || programs.find((p) => p.id === programId)?.code);
        response = await client.syllabus.upload(fd);
      }
      const data = response.data;
      const id = data.syllabusId || data.syllabus?.id || data.syllabus?._id;
      if (!id) throw new Error('The server did not return a syllabus ID.');
      onUploaded?.(id);
    } catch (err) { setError((await describeError(err, mode === 'scratch' ? S.errCreate : S.errUpload)).message); }
    finally { setBusy(false); }
  };
  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: { xs: 2, md: 4 } }}>
      <Typography variant="h4" gutterBottom>{S.welcomeTitle}</Typography>
      <Typography color="text.secondary">{S.welcomeHint}</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ my: 3 }}>
        {[['scratch', S.fromScratch, S.fromScratchHint], ['upload', S.haveDraft, S.haveDraftHint]].map(([key, label, hint]) => (
          <Paper key={key} variant="outlined" sx={{ p: 2, flex: 1, borderColor: mode === key ? 'primary.main' : 'divider' }}>
            <Button fullWidth variant={mode === key ? 'contained' : 'outlined'} disabled={busy} onClick={() => { setMode(key); setError(''); }}>{label}</Button>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{hint}</Typography>
          </Paper>
        ))}
      </Stack>
      {mode && <Stack component="form" onSubmit={submit} spacing={2}>
        <TextField label={S.courseTitle} value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} required />
        {mode === 'scratch' && <TextField label={S.courseCode} value={courseCode} onChange={(e) => setCourseCode(e.target.value)} disabled={busy} />}
        <FormControl fullWidth disabled={busy || loading || !programs.length}>
          <InputLabel id="program-label">{S.program}</InputLabel>
          <Select labelId="program-label" label={S.program} value={programId} onChange={(e) => { setProgramId(e.target.value); setProgramCode(''); }}>
            {programs.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl fullWidth disabled={busy || !editions.length}>
          <InputLabel id="edition-label">{S.edition}</InputLabel>
          <Select labelId="edition-label" label={S.edition} value={programCode} onChange={(e) => setProgramCode(e.target.value)}>
            {editions.map((ed) => <MenuItem key={ed.code} value={ed.code}>{ed.label || ed.code}</MenuItem>)}
          </Select>
        </FormControl>
        {mode === 'upload' && <Paper {...getRootProps()} variant="outlined" sx={{ p: 3, textAlign: 'center', borderStyle: 'dashed', cursor: 'pointer', borderColor: isDragActive ? 'primary.main' : 'divider' }}>
          <input {...getInputProps()} /><CloudUpload color="primary" />
          <Typography>{file?.name || (isDragActive ? S.dropHere : S.dropOrClick)}</Typography>
          <Typography variant="body2" color="text.secondary">{S.fileFormats}</Typography>
          <Typography variant="caption" color="text.secondary">{S.fileHint}</Typography>
        </Paper>}
        <Button type="submit" variant="contained" disabled={busy || loading || !programs.length} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}>
          {mode === 'scratch' ? (busy ? S.creating : S.create) : (busy ? S.uploading : S.uploadAndAnalyze)}
        </Button>
      </Stack>}
      {loading && <Typography sx={{ mt: 2 }}>{S.loadingPrograms}…</Typography>}
      {!loading && !programs.length && <Alert severity="warning" sx={{ mt: 2 }}>{S.noPrograms}</Alert>}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Box>
  );
};
export default EmptyState;
