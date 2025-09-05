import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, FormControl, InputLabel,
  Select, MenuItem, Alert, Snackbar, Switch, FormControlLabel,
  Card, CardContent, CardActions, Grid, Fab
} from '@mui/material';
import {
  Add, Edit, Delete, Visibility, CheckCircle, Warning
} from '@mui/icons-material';
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
    type: 'teaching-tips',
    isRequired: true
  });
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
      type: 'teaching-tips',
      isRequired: true
    });
    setDialogOpen(true);
  };

  const handleEdit = (policy) => {
    setEditingPolicy(policy);
    setFormData({
      title: policy.title,
      content: policy.content,
      type: policy.type,
      isRequired: policy.isRequired
    });
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
      if (editingPolicy) {
        await api.policies.update(editingPolicy._id, formData);
        setSnackbar({ open: true, message: 'Документ оновлено успішно', severity: 'success' });
      } else {
        await api.policies.create(formData);
        setSnackbar({ open: true, message: 'Документ створено успішно', severity: 'success' });
      }
      setDialogOpen(false);
      loadPolicies();
    } catch (err) {
      setSnackbar({ open: true, message: 'Помилка при збереженні документа', severity: 'error' });
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
              </CardContent>

              <CardActions>
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

            <TextField
              fullWidth
              multiline
              rows={8}
              label="Зміст документа"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              required
            />

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
