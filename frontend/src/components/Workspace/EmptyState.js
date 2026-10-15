import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Collapse,
  Button,
  TextField,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from '@mui/material';
import { CloudUpload, ExpandMore, ExpandLess, Description } from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import api from '../../services/api';

const STEPS = [
  { title: 'Завантаження', detail: 'Додайте DOCX, DOC або PDF з чернеткою силабуса. DOCX дає найкращий результат.' },
  { title: 'Перевірка', detail: 'Я звіряю його з шаблоном KSE MBA та результатами навчання MBA-27.' },
  { title: 'Виправлення', detail: 'Ми проходимо пропозиції по одній: кожну можна прийняти, змінити або відхилити, зміни показано прямо в тексті.' },
  { title: 'Надсилання', detail: 'Завантажте DOCX з правками (tracked changes) або PDF і надішліть їх академічному директору.' },
];

const ACCEPTED = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'application/pdf': ['.pdf'],
};

const EmptyState = ({ onUploaded }) => {
  const [howOpen, setHowOpen] = useState(false);
  const [courseName, setCourseName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [programId, setProgramId] = useState('');
  const [programsLoading, setProgramsLoading] = useState(true);
  const [programsError, setProgramsError] = useState('');

  useEffect(() => {
    let active = true;

    const loadPrograms = async () => {
      try {
        const { data } = await api.cabinet.listPrograms();
        if (!active) return;
        setPrograms(Array.isArray(data) ? data : []);
        setProgramsError('');
      } catch (err) {
        if (!active) return;
        setPrograms([]);
        setProgramsError(err.response?.data?.message || err.message || 'Не вдалося завантажити програми');
      } finally {
        if (active) setProgramsLoading(false);
      }
    };

    loadPrograms();
    return () => {
      active = false;
    };
  }, []);

  const onDrop = (accepted) => {
    setError('');
    if (accepted[0]) {
      setPendingFile(accepted[0]);
      if (!courseName) {
        const name = accepted[0].name.replace(/\.[^.]+$/, '');
        setCourseName(name);
      }
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  });

  const upload = async () => {
    if (!pendingFile || !courseName.trim()) {
      setError('Вкажіть назву курсу перед завантаженням.');
      return;
    }
    if (programsLoading) {
      setError('Програми ще завантажуються. Зачекайте і спробуйте ще раз.');
      return;
    }
    if (programsError || programs.length === 0) {
      setError('Для завантаження силабуса потрібна хоча б одна програма.');
      return;
    }
    if (!programId) {
      setError('Оберіть програму перед завантаженням.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('syllabus', pendingFile);
      fd.append('courseName', courseName.trim());
      if (programId) fd.append('programId', programId);
      const { data } = await api.syllabus.upload(fd);
      onUploaded?.(data.syllabusId);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Не вдалося завантажити');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', p: 4 }}>
      <Typography variant="h4" gutterBottom>
        Вітаю! Я допоможу підготувати силабус, що відповідає всім стандартам KSE Graduate Business School.
      </Typography>
      <Typography variant="body1" color="text.secondary" gutterBottom>
        Завантажте чернетку — далі я допоможу.
      </Typography>

      <Paper
        {...getRootProps()}
        sx={{
          mt: 3,
          p: 5,
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : 'divider',
          backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.15s',
          '&:hover': { borderColor: 'primary.main' },
        }}
      >
        <input {...getInputProps()} />
        <CloudUpload sx={{ fontSize: 56, color: 'primary.main', mb: 1 }} />
        <Typography variant="h6" gutterBottom>
          {pendingFile
            ? pendingFile.name
            : isDragActive
              ? 'Перетягніть силабус сюди'
              : 'Перетягніть силабус сюди або натисніть, щоб обрати файл'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          DOCX, DOC, PDF · до 10 МБ
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          DOCX дає найкращий результат: зберігається оригінальне форматування, а правки додаються як tracked changes.
          PDF буде перетворено на простий DOCX.
        </Typography>
      </Paper>

      {pendingFile && (
        <Box
          sx={{
            mt: 2,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(180px, 240px) auto' },
            gap: 2,
            alignItems: 'center',
          }}
        >
          <TextField
            fullWidth
            size="small"
            label="Назва курсу"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
          />
          <FormControl size="small" fullWidth disabled={programsLoading || programs.length === 0}>
            <InputLabel id="syllabus-program-label">Програма</InputLabel>
            <Select
              labelId="syllabus-program-label"
              label="Програма"
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
            >
              <MenuItem value="" disabled>
                {programsLoading ? 'Завантаження програм' : programs.length ? 'Оберіть програму' : 'Немає доступних програм'}
              </MenuItem>
              {programs.map((program) => (
                <MenuItem key={program._id} value={program._id}>
                  {program.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            onClick={upload}
            disabled={uploading || programsLoading}
            startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <Description />}
            sx={{ minWidth: 160, width: { xs: '100%', md: 'auto' } }}
          >
            {uploading ? 'Завантаження' : 'Завантажити й проаналізувати'}
          </Button>
        </Box>
      )}

      {programsError && <Alert severity="warning" sx={{ mt: 2 }}>{programsError}</Alert>}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      <Box sx={{ mt: 4 }}>
        <Button
          variant="text"
          onClick={() => setHowOpen((v) => !v)}
          endIcon={howOpen ? <ExpandLess /> : <ExpandMore />}
        >
          Як це працює?
        </Button>
        <Collapse in={howOpen}>
          <Box sx={{ mt: 2, display: 'grid', gap: 2 }}>
            {STEPS.map((s, i) => (
              <Paper key={s.title} variant="outlined" sx={{ p: 2, display: 'flex', gap: 2 }}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </Box>
                <Box>
                  <Typography variant="subtitle2">{s.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{s.detail}</Typography>
                </Box>
              </Paper>
            ))}
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
};

export default EmptyState;
