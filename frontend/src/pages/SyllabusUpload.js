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
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';
import {
  CloudUpload,
  Description,
  Delete,
  CheckCircle,
  Error,
  Info,
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
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState('');

  const steps = ['Вибір файлів', 'Метадані', 'Завантаження'];

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
      setError(`Деякі файли були відхилені: ${reasons.join('; ')}`);
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
      setError('Будь ласка, введіть назву курсу для всіх файлів');
      return false;
    }
    return true;
  };

  const uploadFiles = async () => {
    if (!validateFiles()) return;

    setUploading(true);
    setCurrentStep(2);
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
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress(prev => ({ 
              ...prev, 
              [fileData.id]: percentCompleted 
            }));
          },
        });

        setUploadResults(prev => [...prev, {
          ...fileData,
          success: true,
          syllabusId: response.data.syllabusId || response.data._id,
        }]);

      } catch (err) {
        const errorMessage = err.response?.data?.message || err.message || 'Помилка завантаження';
        setUploadResults(prev => [...prev, {
          ...fileData,
          success: false,
          error: errorMessage,
        }]);
      }
    }

    setUploading(false);
  };

  const handleNext = () => {
    if (currentStep === 0 && files.length === 0) {
      setError('Будь ласка, виберіть файли для завантаження');
      return;
    }
    if (currentStep === 1 && !validateFiles()) {
      return;
    }
    if (currentStep === 1) {
      uploadFiles();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => prev - 1);
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

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Box>
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
              <CloudUpload sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                {isDragActive ? 
                  'Відпустіть файли тут...' : 
                  'Перетягніть файли сюди або натисніть для вибору'
                }
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Підтримувані формати: PDF, DOC, DOCX (максимум 10MB)
              </Typography>
              <Button variant="outlined" sx={{ mt: 2 }}>
                Вибрати файли
              </Button>
            </Paper>

            {files.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Вибрані файли ({files.length})
                </Typography>
                <List>
                  {files.map((fileData) => (
                    <ListItem key={fileData.id} divider>
                      <ListItemIcon>
                        {getFileIcon(fileData.file)}
                      </ListItemIcon>
                      <ListItemText
                        primary={fileData.file.name}
                        secondary={formatFileSize(fileData.file.size)}
                      />
                      <ListItemSecondaryAction>
                        <IconButton onClick={() => removeFile(fileData.id)}>
                          <Delete />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        );

      case 1:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Метадані курсів
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Введіть інформацію про кожен курс для кращого аналізу
            </Typography>
            
            {files.map((fileData, index) => (
              <Card key={fileData.id} sx={{ mb: 2 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    {getFileIcon(fileData.file)}
                    <Typography variant="subtitle1" sx={{ ml: 1 }}>
                      {fileData.file.name}
                    </Typography>
                  </Box>
                  
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label="Назва курсу *"
                        value={fileData.courseName}
                        onChange={(e) => updateFileMetadata(fileData.id, 'courseName', e.target.value)}
                        placeholder="Наприклад: Мікроекономіка"
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label="Код курсу"
                        value={fileData.courseCode}
                        onChange={(e) => updateFileMetadata(fileData.id, 'courseCode', e.target.value)}
                        placeholder="Наприклад: ECON101"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Опис курсу"
                        value={fileData.description}
                        onChange={(e) => updateFileMetadata(fileData.id, 'description', e.target.value)}
                        multiline
                        rows={2}
                        placeholder="Короткий опис курсу..."
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            ))}
          </Box>
        );

      case 2:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Результати завантаження
            </Typography>
            
            {uploading && (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography>Завантаження файлів...</Typography>
                </Box>
              </Alert>
            )}

            {uploadResults.map((result) => (
              <Card key={result.id} sx={{ mb: 2 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    {result.success ? 
                      <CheckCircle color="success" /> : 
                      <Error color="error" />
                    }
                    <Typography variant="subtitle1" sx={{ ml: 1 }}>
                      {result.file.name}
                    </Typography>
                  </Box>
                  
                  {uploading && uploadProgress[result.id] !== undefined && (
                    <LinearProgress 
                      variant="determinate" 
                      value={uploadProgress[result.id]} 
                      sx={{ mb: 1 }}
                    />
                  )}
                  
                  {result.success ? (
                    <Box>
                      <Chip label="Успішно завантажено" color="success" size="small" />
                      <Button
                        size="small"
                        onClick={() => navigate(`/syllabi/${result.syllabusId}`)}
                        sx={{ ml: 1 }}
                      >
                        Переглянути
                      </Button>
                    </Box>
                  ) : result.error && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                      {result.error}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            ))}

            {!uploading && uploadResults.length > 0 && (
              <Box sx={{ mt: 3, textAlign: 'center' }}>
                <Button
                  variant="contained"
                  onClick={() => navigate('/syllabi')}
                  sx={{ mr: 2 }}
                >
                  Переглянути всі силабуси
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setFiles([]);
                    setUploadResults([]);
                    setCurrentStep(0);
                  }}
                >
                  Завантажити ще
                </Button>
              </Box>
            )}
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <School sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Завантаження силабуса
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Завантажте ваші силабуси для аналізу за допомогою AI
        </Typography>
      </Box>

      {/* Steps */}
      <Stepper activeStep={currentStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Content */}
      <Card>
        <CardContent sx={{ p: 3 }}>
          {renderStepContent()}
        </CardContent>
      </Card>

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
        <Button
          onClick={handleBack}
          disabled={currentStep === 0 || uploading}
        >
          Назад
        </Button>
        
        <Box>
          {currentStep < steps.length - 1 && (
            <Button
              variant="contained"
              onClick={handleNext}
              disabled={uploading}
              startIcon={currentStep === 1 ? <Psychology /> : undefined}
            >
              {currentStep === 1 ? 'Завантажити та аналізувати' : 'Далі'}
            </Button>
          )}
        </Box>
      </Box>

      {/* Info */}
      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2">
          <strong>Поради:</strong> Для кращого аналізу переконайтеся, що ваш силабус містить:
          цілі курсу, структуру занять, методи оцінювання та рекомендовану літературу.
        </Typography>
      </Alert>
    </Box>
  );
};

export default SyllabusUpload;
