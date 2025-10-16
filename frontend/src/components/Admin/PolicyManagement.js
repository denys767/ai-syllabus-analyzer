import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, FormControl, InputLabel,
  Select, MenuItem, Alert, Snackbar, Switch, FormControlLabel,
  Card, CardContent, CardActions, Grid, Fab, Radio, RadioGroup, FormLabel,
  Stack
} from '@mui/material';
import {
  Add, Edit, Delete, Visibility, CheckCircle, Warning, AttachFile, Download
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import api from '../../services/api';

const PolicyManagement = () => {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    contentType: 'markdown',
    type: 'teaching-tips',
    isRequired: true
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    try {
      setLoading(true);
      const response = await api.policies.getAll();
      setPolicies(response.data.policies);
    } catch (err) {
      setError('Не вдалося завантажити документи');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingPolicy(null);
    setFormData({
      title: '',
      content: '',
      contentType: 'markdown',
      type: 'teaching-tips',
      isRequired: true
    });
    setSelectedFile(null);
    setPreviewMode(false);
    setDialogOpen(true);
  };

  const handleEdit = (policy) => {
    setEditingPolicy(policy);
    setFormData({
      title: policy.title,
      content: policy.content,
      contentType: policy.contentType || 'markdown',
      type: policy.type,
      isRequired: policy.isRequired
    });
    setSelectedFile(null);
    setPreviewMode(false);
    setDialogOpen(true);
  };

  const handleDelete = async (policyId) => {
    if (!window.confirm('Ви впевнені, що хочете видалити цей документ?')) return;

    try {
      await api.policies.delete(policyId);
      setSnackbar({ open: true, message: 'Документ видалено успішно', severity: 'success' });
      loadPolicies();
    } catch (err) {
      setSnackbar({ open: true, message: 'Помилка при видаленні документа', severity: 'error' });
      console.error(err);
    }
  };

  const handleSubmit = async () => {
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('title', formData.title);
      formDataToSend.append('content', formData.content);
      formDataToSend.append('contentType', formData.contentType);
      formDataToSend.append('type', formData.type);
      formDataToSend.append('isRequired', formData.isRequired);
      
      if (selectedFile) {
        formDataToSend.append('file', selectedFile);
      }

      if (editingPolicy) {
        await api.policies.update(editingPolicy._id, formDataToSend);
        setSnackbar({ open: true, message: 'Документ оновлено успішно', severity: 'success' });
      } else {
        await api.policies.create(formDataToSend);
        setSnackbar({ open: true, message: 'Документ створено успішно', severity: 'success' });
      }
      setDialogOpen(false);
      setSelectedFile(null);
      loadPolicies();
    } catch (err) {
      setSnackbar({ open: true, message: 'Помилка при збереженні документа', severity: 'error' });
      console.error(err);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDownloadFile = async (policyId) => {
    try {
      const response = await api.policies.downloadFile(policyId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', response.headers['content-disposition']?.split('filename=')[1] || 'file');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setSnackbar({ open: true, message: 'Помилка при завантаженні файлу', severity: 'error' });
      console.error(err);
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'ai-policy': return 'Політика AI';
      case 'academic-integrity': return 'Академічна доброчесність';
      case 'teaching-tips': return 'Поради викладання';
      default: return type;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'ai-policy': return 'primary';
      case 'academic-integrity': return 'error';
      case 'teaching-tips': return 'success';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <Typography>Завантаження...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Управління документами</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={handleCreate}
        >
          Додати документ
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {policies.map((policy) => (
          <Grid item xs={12} md={6} lg={4} key={policy._id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Typography variant="h6" sx={{ flex: 1, mr: 1 }}>
                    {policy.title}
                  </Typography>
                  <Chip
                    label={getTypeLabel(policy.type)}
                    color={getTypeColor(policy.type)}
                    size="small"
                  />
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {policy.content.substring(0, 150)}...
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <CheckCircle color="success" fontSize="small" />
                  <Typography variant="body2">
                    Підтверджено: {policy.acknowledgmentCount}
                  </Typography>
                </Box>

                {policy.attachedFile && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <AttachFile fontSize="small" />
                    <Typography variant="body2">
                      Файл: {policy.attachedFile.originalName}
                    </Typography>
                  </Box>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {policy.isRequired ? (
                    <CheckCircle color="success" fontSize="small" />
                  ) : (
                    <Warning color="warning" fontSize="small" />
                  )}
                  <Typography variant="body2">
                    {policy.isRequired ? 'Обов\'язковий' : 'Необов\'язковий'}
                  </Typography>
                </Box>

                <Chip 
                  label={policy.contentType === 'markdown' ? 'Markdown' : 'Текст'} 
                  size="small" 
                  variant="outlined"
                  sx={{ mt: 1 }}
                />
              </CardContent>

              <CardActions>
                {policy.attachedFile && (
                  <IconButton size="small" onClick={() => handleDownloadFile(policy._id)}>
                    <Download />
                  </IconButton>
                )}
                <IconButton size="small" onClick={() => handleEdit(policy)}>
                  <Edit />
                </IconButton>
                <IconButton size="small" onClick={() => handleDelete(policy._id)}>
                  <Delete />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingPolicy ? 'Редагувати документ' : 'Створити документ'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Назва документа"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />

            <FormControl fullWidth>
              <InputLabel>Тип документа</InputLabel>
              <Select
                value={formData.type}
                label="Тип документа"
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <MenuItem value="ai-policy">Політика AI</MenuItem>
                <MenuItem value="academic-integrity">Академічна доброчесність</MenuItem>
                <MenuItem value="teaching-tips">Поради викладання</MenuItem>
              </Select>
            </FormControl>

            <FormControl component="fieldset">
              <FormLabel component="legend">Формат контенту</FormLabel>
              <RadioGroup
                row
                value={formData.contentType}
                onChange={(e) => setFormData({ ...formData, contentType: e.target.value })}
              >
                <FormControlLabel value="markdown" control={<Radio />} label="Markdown" />
                <FormControlLabel value="plain" control={<Radio />} label="Звичайний текст" />
              </RadioGroup>
            </FormControl>

            <Box>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Button
                  size="small"
                  variant={!previewMode ? 'contained' : 'outlined'}
                  onClick={() => setPreviewMode(false)}
                >
                  Редагувати
                </Button>
                <Button
                  size="small"
                  variant={previewMode ? 'contained' : 'outlined'}
                  onClick={() => setPreviewMode(true)}
                  disabled={formData.contentType !== 'markdown'}
                >
                  Попередній перегляд
                </Button>
              </Stack>

              {!previewMode ? (
                <TextField
                  fullWidth
                  multiline
                  rows={10}
                  label="Зміст документа"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  required
                  helperText={formData.contentType === 'markdown' ? 'Підтримується Markdown форматування' : ''}
                />
              ) : (
                <Paper sx={{ p: 2, maxHeight: 400, overflow: 'auto', bgcolor: 'background.default' }}>
                  <ReactMarkdown>{formData.content}</ReactMarkdown>
                </Paper>
              )}
            </Box>

            <Box>
              <Typography variant="body2" gutterBottom>
                Прикріпити файл (необов'язково)
              </Typography>
              <Button
                variant="outlined"
                component="label"
                startIcon={<AttachFile />}
                fullWidth
              >
                {selectedFile ? selectedFile.name : 'Вибрати файл (PDF, DOC, DOCX, TXT, MD)'}
                <input
                  type="file"
                  hidden
                  accept=".pdf,.doc,.docx,.txt,.md"
                  onChange={handleFileChange}
                />
              </Button>
              {editingPolicy?.attachedFile && !selectedFile && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Поточний файл: {editingPolicy.attachedFile.originalName}
                </Typography>
              )}
            </Box>

            <FormControlLabel
              control={
                <Switch
                  checked={formData.isRequired}
                  onChange={(e) => setFormData({ ...formData, isRequired: e.target.checked })}
                />
              }
              label="Обов'язковий для ознайомлення"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Скасувати</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingPolicy ? 'Оновити' : 'Створити'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default PolicyManagement;
