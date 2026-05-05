import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Collapse,
  Button,
  TextField,
  CircularProgress,
  Alert,
} from '@mui/material';
import { CloudUpload, ExpandMore, ExpandLess, Description } from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import api from '../../services/api';

const STEPS = [
  { title: 'Upload', detail: 'Drop a PDF or DOCX of your draft syllabus.' },
  { title: 'Check', detail: 'I scan it against the KSE MBA template and the MBA-27 outcomes.' },
  { title: 'Fix together', detail: 'I walk you through one issue at a time with a Before/After preview.' },
  { title: 'Submit', detail: 'Preview the final PDF, then submit to your Academic Director.' },
];

const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
};

const EmptyState = ({ onUploaded }) => {
  const [howOpen, setHowOpen] = useState(false);
  const [courseName, setCourseName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [pendingFile, setPendingFile] = useState(null);

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
      setError('Please name the course before uploading.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('syllabus', pendingFile);
      fd.append('courseName', courseName.trim());
      const { data } = await api.syllabus.upload(fd);
      onUploaded?.(data.syllabusId);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', p: 4 }}>
      <Typography variant="h4" gutterBottom>
        Hi! I'm here to help you build a syllabus that meets all KSE Graduate Business School standards.
      </Typography>
      <Typography variant="body1" color="text.secondary" gutterBottom>
        Upload your draft and I'll take it from there.
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
              ? 'Drop your syllabus here'
              : 'Drop your syllabus here or click to browse'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          PDF, DOCX · up to 10MB
        </Typography>
      </Paper>

      {pendingFile && (
        <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            fullWidth
            size="small"
            label="Course name"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
          />
          <Button
            variant="contained"
            onClick={upload}
            disabled={uploading}
            startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <Description />}
            sx={{ minWidth: 160 }}
          >
            {uploading ? 'Uploading' : 'Upload & analyze'}
          </Button>
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      <Box sx={{ mt: 4 }}>
        <Button
          variant="text"
          onClick={() => setHowOpen((v) => !v)}
          endIcon={howOpen ? <ExpandLess /> : <ExpandMore />}
        >
          How does this work?
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
