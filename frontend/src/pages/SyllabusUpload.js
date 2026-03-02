import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Grid,
  Alert,
  LinearProgress,
  Paper,
  Chip,
  IconButton,
  CircularProgress,
} from '@mui/material';
import {
  CloudUpload,
  Description,
  Delete,
  CheckCircle,
  Error,
  School,
  Psychology,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import api from '../services/api';

const SyllabusUpload = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadResults, setUploadResults] = useState([]);
  const [error, setError] = useState('');

  const maxSize = 10 * 1024 * 1024; // 10MB
  const acceptedFormats = {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/msword': ['.doc'],
  };

  const onDrop = (acceptedFiles, rejectedFiles) => {
    setError('');
    
    if (rejectedFiles.length > 0) {
      const reasons = rejectedFiles.map(file => 
        file.errors.map(err => err.message).join(', ')
      );
      setError(`Some files were rejected: ${reasons.join('; ')}`);
    }

    const newFiles = acceptedFiles.map(file => ({
      file,
      id: Math.random().toString(36),
      courseName: '',
      courseCode: '',
      description: '',
      uploadStatus: 'pending',
    }));

    setFiles(prev => [...prev, ...newFiles]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFormats,
    maxSize,
    multiple: true,
  });

  const removeFile = (fileId) => {
    setFiles(files.filter(f => f.id !== fileId));
  };

  const updateFileMetadata = (fileId, field, value) => {
    setFiles(files.map(f => 
      f.id === fileId ? { ...f, [field]: value } : f
    ));
  };

  const validateFiles = () => {
    const invalidFiles = files.filter(f => !f.courseName.trim());
    if (invalidFiles.length > 0) {
      setError('Please enter a course name for all files');
      return false;
    }
    return true;
  };

  const uploadFiles = async () => {
    if (files.length === 0) {
      setError('Please select files to upload');
      return;
    }
    if (!validateFiles()) return;

    setUploading(true);
    setUploadResults([]);

    for (const fileData of files) {
      try {
        setUploadProgress(prev => ({ ...prev, [fileData.id]: 0 }));
        
        const formData = new FormData();
        formData.append('syllabus', fileData.file);
        formData.append('courseName', fileData.courseName);
        formData.append('courseCode', fileData.courseCode);
        formData.append('description', fileData.description);

        const response = await api.syllabus.upload(formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress(prev => ({ ...prev, [fileData.id]: percentCompleted }));
          },
        });

        setUploadResults(prev => [...prev, {
          ...fileData,
          success: true,
          syllabusId: response.data.syllabusId || response.data._id,
        }]);
      } catch (err) {
        const errorMessage = err.response?.data?.message || err.message || 'Upload error';
        setUploadResults(prev => [...prev, {
          ...fileData,
          success: false,
          error: errorMessage,
        }]);
      }
    }

    setUploading(false);
  };

  const getFileIcon = (file) => {
    if (file.type === 'application/pdf') {
      return <Description color="error" />;
    }
    return <Description color="primary" />;
  };

  const formatFileSize = (bytes) => {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  const uploadDone = !uploading && uploadResults.length > 0;

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <School sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Syllabus Upload
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Upload your syllabi for AI analysis
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {!uploadDone ? (
        <Card>
          <CardContent sx={{ p: 3 }}>
            {/* Drop zone */}
            <Paper
              {...getRootProps()}
              sx={{
                p: 4,
                textAlign: 'center',
                border: '2px dashed',
                borderColor: isDragActive ? 'primary.main' : 'grey.300',
                backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: 'primary.main',
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <input {...getInputProps()} />
              <CloudUpload sx={{ fontSize: 56, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6" gutterBottom>
                {isDragActive ? 'Drop files here...' : 'Drag and drop files here or click to select'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Supported formats: PDF, DOC, DOCX (max 10MB)
              </Typography>
            </Paper>

            {/* File list with inline metadata */}
            {files.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Selected Files ({files.length})
                </Typography>
                {files.map((fileData) => (
                  <Paper key={fileData.id} variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      {getFileIcon(fileData.file)}
                      <Typography variant="body2" sx={{ ml: 1, flex: 1 }}>
                        {fileData.file.name}
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          ({formatFileSize(fileData.file.size)})
                        </Typography>
                      </Typography>
                      <IconButton size="small" onClick={() => removeFile(fileData.id)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Course Name *"
                          value={fileData.courseName}
                          onChange={(e) => updateFileMetadata(fileData.id, 'courseName', e.target.value)}
                          placeholder="e.g., Microeconomics"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Course Code"
                          value={fileData.courseCode}
                          onChange={(e) => updateFileMetadata(fileData.id, 'courseCode', e.target.value)}
                          placeholder="e.g., ECON101"
                        />
                      </Grid>
                    </Grid>
                  </Paper>
                ))}

                <Box sx={{ textAlign: 'right', mt: 2 }}>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={uploadFiles}
                    disabled={uploading}
                    startIcon={uploading ? <CircularProgress size={18} color="inherit" /> : <Psychology />}
                  >
                    {uploading ? 'Uploading...' : 'Upload and Analyze'}
                  </Button>
                </Box>

                {uploading && (
                  <Box sx={{ mt: 2 }}>
                    {files.map(f => (
                      uploadProgress[f.id] !== undefined && (
                        <Box key={f.id} sx={{ mb: 1 }}>
                          <Typography variant="caption">{f.file.name}</Typography>
                          <LinearProgress variant="determinate" value={uploadProgress[f.id]} sx={{ mt: 0.5 }} />
                        </Box>
                      )
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Upload results */
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Upload Results</Typography>
            {uploadResults.map((result) => (
              <Paper key={result.id} variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  {result.success ? <CheckCircle color="success" /> : <Error color="error" />}
                  <Typography variant="subtitle2" sx={{ ml: 1 }}>{result.file.name}</Typography>
                </Box>
                {result.success ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label="Successfully Uploaded" color="success" size="small" />
                    <Button size="small" onClick={() => navigate(`/syllabi/${result.syllabusId}`)}>
                      View Analysis
                    </Button>
                  </Box>
                ) : (
                  <Alert severity="error" sx={{ mt: 1 }}>{result.error}</Alert>
                )}
              </Paper>
            ))}
            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
              <Button variant="contained" onClick={() => navigate('/syllabi')}>
                View All Syllabi
              </Button>
              <Button variant="outlined" onClick={() => { setFiles([]); setUploadResults([]); }}>
                Upload More
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {!uploadDone && (
        <Alert severity="info" sx={{ mt: 3 }}>
          <Typography variant="body2">
            <strong>Tips:</strong> For better analysis, make sure your syllabus contains:
            course objectives, lesson structure, assessment methods, and recommended literature.
          </Typography>
        </Alert>
      )}
    </Box>
  );
};

export default SyllabusUpload;
