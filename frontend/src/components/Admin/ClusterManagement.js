import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, IconButton, Chip, Alert, Snackbar, Grid, Card, CardContent,
  CircularProgress
} from '@mui/material';
import {
  Add, Delete, CheckCircle
} from '@mui/icons-material';
import api from '../../services/api';

const ClusterManagement = () => {
  const [clusters, setClusters] = useState([]);
  const [currentCluster, setCurrentCluster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [formData, setFormData] = useState({
    quarter: '',
    totalStudents: 0,
    notes: '',
    clusters: [
      { id: 1, name: 'Technology Leaders', percentage: 25, description: '', characteristics: [], businessChallenges: [] },
      { id: 2, name: 'Finance & Banking', percentage: 25, description: '', characteristics: [], businessChallenges: [] },
      { id: 3, name: 'Military & Public', percentage: 25, description: '', characteristics: [], businessChallenges: [] },
      { id: 4, name: 'Business Operations', percentage: 25, description: '', characteristics: [], businessChallenges: [] }
    ]
  });
  const [clusterErrors, setClusterErrors] = useState([]); // per-cluster field errors
  const [formErrors, setFormErrors] = useState({ quarter: '', percentages: '' });
  // removed unused touched state

  useEffect(() => {
    fetchClusters();
    fetchCurrentCluster();
  }, []);

  const fetchClusters = async () => {
    try {
      // FIX: backend route is /api/clusters (router root '/'), previous '/clusters/clusters' caused 404
      const response = await api.get('/clusters');
      setClusters(response.data.clusters);
    } catch (error) {
      setSnackbar({ 
        open: true, 
        message: 'Помилка завантаження кластерів', 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentCluster = async () => {
    try {
      // FIX: correct endpoint is /clusters/current
      const response = await api.get('/clusters/current');
      setCurrentCluster(response.data.clusters);
    } catch (error) {
      console.error('Error fetching current cluster:', error);
    }
  };

  const handleCreateCluster = () => {
    const currentQuarter = getCurrentQuarter();
    setFormData({
      quarter: currentQuarter,
      totalStudents: 0,
      notes: '',
      clusters: [
        { id: 1, name: 'Technology Leaders', percentage: 25, description: '', characteristics: [], businessChallenges: [] },
        { id: 2, name: 'Finance & Banking', percentage: 25, description: '', characteristics: [], businessChallenges: [] },
        { id: 3, name: 'Military & Public', percentage: 25, description: '', characteristics: [], businessChallenges: [] },
        { id: 4, name: 'Business Operations', percentage: 25, description: '', characteristics: [], businessChallenges: [] }
      ]
    });
    setClusterErrors([]);
    setFormErrors({ quarter: '', percentages: '' });
    setDialogOpen(true);
  };

  const getCurrentQuarter = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const quarter = Math.ceil(month / 3);
    return `Q${quarter} ${year}`;
  };

  const validate = () => {
    const newClusterErrors = formData.clusters.map(c => ({
      name: !c.name?.trim(),
      percentage: !(c.percentage || c.percentage === 0) || c.percentage < 0 || c.percentage > 100,
      description: !c.description?.trim()
    }));
    const totalPercentage = formData.clusters.reduce((sum, c) => sum + (Number(c.percentage) || 0), 0);
    const percentError = Math.abs(totalPercentage - 100) > 5;
    const quarterError = !/^Q[1-4] \d{4}$/.test(formData.quarter.trim());
    setClusterErrors(newClusterErrors);
    setFormErrors({
      quarter: quarterError ? 'Формат кварталу: Q1 2025' : '',
      percentages: percentError ? 'Сума відсотків повинна бути ~100% (допуск ±5%)' : ''
    });
    const invalid = newClusterErrors.some(e => e.name || e.percentage || e.description) || percentError || quarterError;
    return !invalid;
  };

  const handleSaveCluster = async () => {
    try {
      if (!validate()) {
        setSnackbar({ open: true, message: 'Перевірте помилки у формі', severity: 'error' });
        return;
      }

  // FIX: create cluster config -> POST /clusters
  await api.post('/clusters', formData);
      setSnackbar({ 
        open: true, 
        message: 'Конфігурацію кластерів створено успішно', 
        severity: 'success' 
      });
      setDialogOpen(false);
      fetchClusters();
      fetchCurrentCluster();
    } catch (error) {
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.message || 'Помилка збереження', 
        severity: 'error' 
      });
    }
  };

  const handleActivateCluster = async (clusterId) => {
    try {
      // Use unified api client helper if available, else fallback
      if (api.clusters?.activate) {
        await api.clusters.activate(clusterId);
      } else {
        await api.patch(`/clusters/${clusterId}/activate`);
      }
      setSnackbar({
        open: true,
        message: 'Конфігурацію кластерів активовано',
        severity: 'success'
      });
      await Promise.all([fetchClusters(), fetchCurrentCluster()]);
    } catch (error) {
      console.error('Activate cluster error:', error);
      const msg = error.response?.data?.message || error.message || 'Помилка активації';
      setSnackbar({
        open: true,
        message: msg,
        severity: 'error'
      });
    }
  };

  const handleDeleteCluster = async (clusterId) => {
    if (window.confirm('Ви впевнені, що хочете видалити цю конфігурацію кластерів?')) {
      try {
  // FIX: delete cluster config -> DELETE /clusters/:id
  await api.delete(`/clusters/${clusterId}`);
        setSnackbar({ 
          open: true, 
          message: 'Конфігурацію видалено', 
          severity: 'success' 
        });
        fetchClusters();
        fetchCurrentCluster();
      } catch (error) {
        setSnackbar({ 
          open: true, 
          message: error.response?.data?.message || 'Помилка видалення', 
          severity: 'error' 
        });
      }
    }
  };

  const updateClusterData = (index, field, value) => {
    const updatedClusters = [...formData.clusters];
    updatedClusters[index] = { ...updatedClusters[index], [field]: value };
  setFormData({ ...formData, clusters: updatedClusters });
  };

  const updateClusterArray = (index, field, value) => {
    const updatedClusters = [...formData.clusters];
    updatedClusters[index] = { 
      ...updatedClusters[index], 
      [field]: value.split(',').map(item => item.trim()).filter(item => item.length > 0)
    };
    setFormData({ ...formData, clusters: updatedClusters });
  };

  const addCluster = () => {
    const nextId = (formData.clusters.reduce((m, c) => Math.max(m, c.id), 0) || 0) + 1;
    setFormData(f => ({
      ...f,
      clusters: [...f.clusters, { id: nextId, name: '', percentage: 0, description: '', characteristics: [], businessChallenges: [] }]
    }));
  };

  const removeCluster = (index) => {
    setFormData(f => ({
      ...f,
      clusters: f.clusters.filter((_, i) => i !== index)
    }));
  };

  const isClusterFieldError = (index, field) => {
    const ce = clusterErrors[index];
    if (!ce) return false;
    if (field === 'name') return ce.name;
    if (field === 'percentage') return ce.percentage;
    if (field === 'description') return ce.description;
    return false;
  };

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
      <CircularProgress />
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Управління кластерами студентів
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={handleCreateCluster}
        >
          Створити конфігурацію
        </Button>
      </Box>

      {/* Current Active Configuration */}
      {currentCluster && (
        <Paper sx={{ p: 3, mb: 3, backgroundColor: '#f8f9fa' }}>
          <Typography variant="h6" gutterBottom color="primary">
            Поточна активна конфігурація: {currentCluster.quarter}
          </Typography>
          <Grid container spacing={2}>
            {currentCluster.clusters && currentCluster.clusters.map((cluster) => (
              <Grid item xs={12} sm={6} md={3} key={cluster.id}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" color="primary">
                      {cluster.name}
                    </Typography>
                    <Typography variant="h4" color="secondary">
                      {cluster.percentage}%
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {cluster.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {/* Historical Configurations */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Історія конфігурацій
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Квартал</TableCell>
                <TableCell>Загальна кількість студентів</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Завантажив</TableCell>
                <TableCell>Дата створення</TableCell>
                <TableCell>Дії</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clusters.map((cluster) => (
                <TableRow key={cluster._id}>
                  <TableCell>{cluster.quarter}</TableCell>
                  <TableCell>{cluster.totalStudents || '-'}</TableCell>
                  <TableCell>
                    <Chip 
                      label={cluster.isActive ? 'Активна' : 'Неактивна'}
                      color={cluster.isActive ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {cluster.uploadedBy ? 
                      `${cluster.uploadedBy.firstName} ${cluster.uploadedBy.lastName}` : 
                      'Невідомо'
                    }
                  </TableCell>
                  <TableCell>
                    {new Date(cluster.createdAt).toLocaleDateString('uk-UA')}
                  </TableCell>
                  <TableCell>
                    {!cluster.isActive && (
                      <IconButton 
                        onClick={() => handleActivateCluster(cluster._id)}
                        color="success"
                        size="small"
                        title="Активувати"
                      >
                        <CheckCircle />
                      </IconButton>
                    )}
                    <IconButton 
                      onClick={() => handleDeleteCluster(cluster._id)}
                      color="error"
                      size="small"
                      title="Видалити"
                    >
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Створити конфігурацію кластерів</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Квартал"
                  value={formData.quarter}
                  onChange={(e) => setFormData({ ...formData, quarter: e.target.value })}
                  fullWidth
                  placeholder="Q1 2024"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Загальна кількість студентів"
                  type="number"
                  value={formData.totalStudents}
                  onChange={(e) => setFormData({ ...formData, totalStudents: parseInt(e.target.value) || 0 })}
                  fullWidth
                />
              </Grid>
            </Grid>

            <TextField
              label="Примітки"
              multiline
              rows={2}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              fullWidth
            />

            <Typography variant="h6">Конфігурація кластерів</Typography>
            
            {formData.clusters.map((cluster, index) => (
              <Paper key={cluster.id} sx={{ p: 2, border: '1px solid #e0e0e0', position: 'relative' }}>
                {formData.clusters.length > 1 && (
                  <IconButton
                    size="small"
                    onClick={() => removeCluster(index)}
                    sx={{ position: 'absolute', top: 4, right: 4 }}
                    color="error"
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                )}
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Назва кластера"
                      value={cluster.name}
                      onChange={(e) => updateClusterData(index, 'name', e.target.value)}
                      required
                      error={isClusterFieldError(index, 'name')}
                      helperText={isClusterFieldError(index, 'name') && 'Обов\'язкове поле'}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="Відсоток (%)"
                      type="number"
                      value={cluster.percentage}
                      onChange={(e) => updateClusterData(index, 'percentage', parseInt(e.target.value) || 0)}
                      fullWidth
                      inputProps={{ min: 0, max: 100 }}
                      required
                      error={isClusterFieldError(index, 'percentage')}
                      helperText={isClusterFieldError(index, 'percentage') && '0–100'}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Опис"
                      value={cluster.description}
                      onChange={(e) => updateClusterData(index, 'description', e.target.value)}
                      fullWidth
                      required
                      error={isClusterFieldError(index, 'description')}
                      helperText={isClusterFieldError(index, 'description') && 'Обов\'язкове поле'}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Характеристики (через кому)"
                      value={cluster.characteristics.join(', ')}
                      onChange={(e) => updateClusterArray(index, 'characteristics', e.target.value)}
                      fullWidth
                      multiline
                      rows={2}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Бізнес-виклики (через кому)"
                      value={cluster.businessChallenges.join(', ')}
                      onChange={(e) => updateClusterArray(index, 'businessChallenges', e.target.value)}
                      fullWidth
                      multiline
                      rows={2}
                    />
                  </Grid>
                </Grid>
              </Paper>
            ))}

            <Box>
              <Button variant="outlined" startIcon={<Add />} onClick={addCluster} sx={{ mt: 1 }}>
                Додати кластер
              </Button>
            </Box>

            <Alert severity={formErrors.percentages ? 'error' : 'info'} sx={{ mt: 2 }}>
              {formErrors.percentages || (
                <>Переконайтеся, що загальна сума відсотків близька до 100%. Поточна сума: {formData.clusters.reduce((sum, cluster) => sum + (Number(cluster.percentage) || 0), 0)}%</>
              )}
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Скасувати</Button>
          <Button onClick={handleSaveCluster} variant="contained">
            Зберегти
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
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

export default ClusterManagement;
