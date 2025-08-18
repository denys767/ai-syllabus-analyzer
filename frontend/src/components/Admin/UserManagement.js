import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, IconButton, Tooltip, TextField, Select, MenuItem, 
  FormControl, InputLabel, CircularProgress, Alert, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, Grid, Chip
} from '@mui/material';
import { Edit, Delete, CheckCircle, Cancel, Add, PersonAdd } from '@mui/icons-material';
import api from '../../services/api';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    verified: '',
    active: '',
  });

  // Dialog states
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState('create'); // 'create' or 'edit'
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'instructor',
    department: '',
    isActive: true,
    isVerified: true,
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(
        Object.entries(filters).filter(([, value]) => value)
      ).toString();
      const response = await api.get(`/admin/users?${params}`);
      setUsers(response.data.users || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Помилка завантаження користувачів');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleCreateUser = () => {
    setDialogMode('create');
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      role: 'instructor',
      department: '',
      isActive: true,
      isVerified: true,
    });
    setFormErrors({});
    setSelectedUser(null);
    setOpenDialog(true);
  };

  const handleEditUser = (user) => {
    setDialogMode('edit');
    setFormData({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      password: '', // Don't show password
      role: user.role,
      department: user.department || '',
      isActive: user.isActive,
      isVerified: user.isVerified,
    });
    setFormErrors({});
    setSelectedUser(user);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedUser(null);
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      role: 'instructor',
      department: '',
      isActive: true,
      isVerified: true,
    });
    setFormErrors({});
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
    // Clear error when user starts typing
    if (formErrors[name]) {
      setFormErrors({ ...formErrors, [name]: '' });
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.firstName.trim()) {
      errors.firstName = "Ім'я є обов'язковим";
    }
    if (!formData.lastName.trim()) {
      errors.lastName = "Прізвище є обов'язковим";
    }
    if (!formData.email.trim()) {
      errors.email = 'Email є обов\'язковим';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Email має неправильний формат';
    }
    if (dialogMode === 'create' && !formData.password.trim()) {
      errors.password = 'Пароль є обов\'язковим';
    }
    if (dialogMode === 'create' && formData.password.length < 6) {
      errors.password = 'Пароль має бути не менше 6 символів';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      if (dialogMode === 'create') {
        await api.post('/auth/create-user', formData);
      } else {
        // For edit, don't send password if it's empty and include all fields that can be updated
        const updateData = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          role: formData.role,
          department: formData.department,
          isActive: formData.isActive,
          isVerified: formData.isVerified,
        };
        
        // Only include password if it's provided
        if (formData.password && formData.password.trim()) {
          updateData.password = formData.password;
        }
        
        await api.put(`/admin/users/${selectedUser._id}`, updateData);
      }
      
      handleCloseDialog();
      fetchUsers(); // Refresh the list
    } catch (err) {
      setError(err.response?.data?.message || `Помилка ${dialogMode === 'create' ? 'створення' : 'редагування'} користувача`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Ви впевнені, що хочете видалити цього користувача?')) {
      try {
        await api.delete(`/admin/users/${userId}`);
        fetchUsers(); // Refresh list
      } catch (err) {
        setError(err.response?.data?.message || 'Помилка видалення користувача');
      }
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'instructor': return 'Викладач';
      case 'admin': return 'Адміністратор';
      case 'manager': return 'Менеджер';
      default: return role;
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">
          Керування користувачами
        </Typography>
        <Button
          variant="contained"
          startIcon={<PersonAdd />}
          onClick={handleCreateUser}
        >
          Створити користувача
        </Button>
      </Box>
      
      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            label="Пошук"
            name="search"
            value={filters.search}
            onChange={handleFilterChange}
            variant="outlined"
            size="small"
            sx={{ minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Роль</InputLabel>
            <Select 
              name="role" 
              value={filters.role} 
              onChange={handleFilterChange} 
              label="Роль"
            >
              <MenuItem value=""><em>Всі</em></MenuItem>
              <MenuItem value="instructor">Викладач</MenuItem>
              <MenuItem value="manager">Менеджер</MenuItem>
              <MenuItem value="admin">Адміністратор</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Paper>

      {/* Users Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Ім'я</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Роль</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Верифіковано</TableCell>
              <TableCell>Дії</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user._id}>
                <TableCell>
                  {user.firstName} {user.lastName}
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{getRoleLabel(user.role)}</TableCell>
                <TableCell>
                  {user.isActive ? (
                    <CheckCircle color="success" />
                  ) : (
                    <Cancel color="error" />
                  )}
                </TableCell>
                <TableCell>
                  {user.isVerified ? (
                    <CheckCircle color="success" />
                  ) : (
                    <Cancel color="error" />
                  )}
                </TableCell>
                <TableCell>
                  <Tooltip title="Редагувати">
                    <IconButton 
                      onClick={() => handleEditUser(user)}
                      size="small"
                    >
                      <Edit />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Видалити">
                    <IconButton 
                      onClick={() => handleDeleteUser(user._id)}
                      size="small"
                      color="error"
                    >
                      <Delete />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {users.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="textSecondary">
            Користувачі не знайдені
          </Typography>
        </Box>
      )}

      {/* Create/Edit User Dialog */}
      <Dialog 
        open={openDialog} 
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {dialogMode === 'create' ? 'Створити нового користувача' : 'Редагувати користувача'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Ім'я"
                name="firstName"
                value={formData.firstName}
                onChange={handleFormChange}
                error={!!formErrors.firstName}
                helperText={formErrors.firstName}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Прізвище"
                name="lastName"
                value={formData.lastName}
                onChange={handleFormChange}
                error={!!formErrors.lastName}
                helperText={formErrors.lastName}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleFormChange}
                error={!!formErrors.email}
                helperText={formErrors.email}
                required
                disabled={dialogMode === 'edit'} // Don't allow email change
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={dialogMode === 'create' ? 'Пароль' : 'Новий пароль (залиште порожнім, щоб не змінювати)'}
                name="password"
                type="password"
                value={formData.password}
                onChange={handleFormChange}
                error={!!formErrors.password}
                helperText={formErrors.password}
                required={dialogMode === 'create'}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Роль</InputLabel>
                <Select
                  name="role"
                  value={formData.role}
                  onChange={handleFormChange}
                  label="Роль"
                >
                  <MenuItem value="instructor">Викладач</MenuItem>
                  <MenuItem value="manager">Менеджер</MenuItem>
                  <MenuItem value="admin">Адміністратор</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Кафедра/Департамент"
                name="department"
                value={formData.department}
                onChange={handleFormChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Статус</InputLabel>
                <Select
                  name="isActive"
                  value={formData.isActive}
                  onChange={handleFormChange}
                  label="Статус"
                >
                  <MenuItem value={true}>Активний</MenuItem>
                  <MenuItem value={false}>Неактивний</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Верифікація</InputLabel>
                <Select
                  name="isVerified"
                  value={formData.isVerified}
                  onChange={handleFormChange}
                  label="Верифікація"
                >
                  <MenuItem value={true}>Верифікований</MenuItem>
                  <MenuItem value={false}>Неверифікований</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>
            Скасувати
          </Button>
          <Button 
            onClick={handleSubmit}
            variant="contained"
            disabled={submitting}
          >
            {submitting ? (
              <CircularProgress size={20} />
            ) : (
              dialogMode === 'create' ? 'Створити' : 'Зберегти'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserManagement;
