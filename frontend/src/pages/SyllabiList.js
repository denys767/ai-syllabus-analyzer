import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Avatar,
  Tooltip,
  Alert,
  LinearProgress,
  Menu,
  ListItemIcon,
  ListItemText,
  Badge,
} from '@mui/material';
import {
  Upload,
  Description,
  Edit,
  Delete,
  Download,
  Psychology,
  Analytics,
  MoreVert,
  Search,
  CheckCircle,
  Warning,
  Error,
  Schedule,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
// import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const SyllabiList = () => {
  const navigate = useNavigate();
  // const { user } = useAuth(); // not currently used
  const [syllabi, setSyllabi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialog, setDeleteDialog] = useState({ open: false, syllabus: null });
  const [editDialog, setEditDialog] = useState({ open: false, syllabus: null });
  const [menuAnchor, setMenuAnchor] = useState({ element: null, syllabus: null });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');

  useEffect(() => {
    loadSyllabi();
  }, []);

  const loadSyllabi = async () => {
    try {
      setLoading(true);
  const response = await api.syllabus.getMySyllabi();
      setSyllabi(response.data.syllabi || []);
    } catch (err) {
      setError('Помилка завантаження силабусів');
      console.error('Load syllabi error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
  await api.syllabus.deleteSyllabus(deleteDialog.syllabus._id);
      setSyllabi(syllabi.filter(s => s._id !== deleteDialog.syllabus._id));
      setDeleteDialog({ open: false, syllabus: null });
    } catch (err) {
      setError('Помилка видалення силабуса');
    }
  };

  const handleEdit = async (formData) => {
    try {
      const response = await api.put(`/syllabus/${editDialog.syllabus._id}`, formData);
      setSyllabi(syllabi.map(s => 
        s._id === editDialog.syllabus._id ? (response.data.syllabus || response.data) : s
      ));
      setEditDialog({ open: false, syllabus: null });
    } catch (err) {
      setError('Помилка оновлення силабуса');
    }
  };

  const handleAnalyze = async (syllabusId) => {
    try {
  await api.post(`/syllabus/${syllabusId}/analyze`);
      loadSyllabi(); // Reload to update status
    } catch (err) {
      setError('Помилка запуску аналізу');
    }
  };

  const handleDownload = async (syllabusId, filename) => {
    try {
  const response = await api.get(`/syllabus/${syllabusId}/download`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Помилка завантаження файлу');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'analyzed':
        return <CheckCircle color="success" />;
      case 'processing':
        return <Schedule color="warning" />;
      case 'error':
        return <Error color="error" />;
      default:
        return <Warning color="action" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'analyzed':
        return 'Проаналізовано';
      case 'processing':
        return 'Обробляється';
      case 'error':
        return 'Помилка';
      default:
        return 'Очікує';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'analyzed':
        return 'success';
      case 'processing':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const filteredSyllabi = syllabi
    .filter(syllabus => {
      const originalName = syllabus.originalName || syllabus.originalFile?.originalName || '';
      const courseName = syllabus.courseName || syllabus.course?.name || syllabus.title || '';
      
      const matchesSearch = originalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           courseName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = !statusFilter || (syllabus.status && syllabus.status === statusFilter);
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          const aName = a.originalName || a.originalFile?.originalName || '';
          const bName = b.originalName || b.originalFile?.originalName || '';
          return aName.localeCompare(bName);
        case 'course':
          const aCourse = a.courseName || a.course?.name || a.title || '';
          const bCourse = b.courseName || b.course?.name || b.title || '';
          return aCourse.localeCompare(bCourse);
        case 'status':
          return (a.status || '').localeCompare(b.status || '');
        default:
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Завантаження силабусів...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight="bold">
          Силабуси
        </Typography>
        <Button
          variant="contained"
          startIcon={<Upload />}
          onClick={() => navigate('/syllabi/upload')}
          sx={{ borderRadius: 2 }}
        >
          Завантажити новий
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                placeholder="Пошук силабусів..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <Search sx={{ mr: 1, color: 'action.active' }} />,
                }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Статус</InputLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  label="Статус"
                >
                  <MenuItem value="">Всі</MenuItem>
                  {/* Removed 'pending' as backend uses 'processing' */}
                  <MenuItem value="processing">Обробляється</MenuItem>
                  <MenuItem value="analyzed">Проаналізовано</MenuItem>
                  <MenuItem value="error">Помилка</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Сортування</InputLabel>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  label="Сортування"
                >
                  <MenuItem value="createdAt">Дата створення</MenuItem>
                  <MenuItem value="name">Назва файлу</MenuItem>
                  <MenuItem value="course">Назва курсу</MenuItem>
                  <MenuItem value="status">Статус</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <Typography variant="body2" color="text.secondary">
                Знайдено: {filteredSyllabi.length}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Syllabi Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Файл</TableCell>
              <TableCell>Курс</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Рекомендації</TableCell>
              <TableCell>Дата завантаження</TableCell>
              <TableCell>AI Оцінка</TableCell>
              <TableCell align="right">Дії</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredSyllabi.length > 0 ? (
              filteredSyllabi.map((syllabus) => (
                <TableRow key={syllabus._id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Avatar sx={{ bgcolor: 'primary.main', mr: 2, width: 32, height: 32 }}>
                        <Description fontSize="small" />
                      </Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight="600">
                          {syllabus.originalName || syllabus.originalFile?.originalName || syllabus.title || 'Без назви'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {syllabus.originalFile?.size ? 
                            `${(syllabus.originalFile.size / 1024 / 1024).toFixed(2)} MB` : 
                            'Розмір невідомий'
                          }
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {syllabus.courseName || syllabus.course?.name || syllabus.title || 'Не вказано'}
                    </Typography>
                    {(syllabus.courseCode || syllabus.course?.code) && (
                      <Typography variant="caption" color="text.secondary">
                        {syllabus.courseCode || syllabus.course?.code}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={getStatusIcon(syllabus.status)}
                      label={getStatusText(syllabus.status)}
                      color={getStatusColor(syllabus.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {Array.isArray(syllabus.recommendations) && syllabus.recommendations.length > 0 ? (
                      (() => {
                        const pending = syllabus.recommendations.filter(r => r.status === 'pending').length;
                        const total = syllabus.recommendations.length;
                        return pending > 0 ? (
                          <Chip label={`Очікує: ${pending}`} color="warning" size="small" />
                        ) : (
                          <Chip label={`Опрацьовано (${total})`} color="success" size="small" />
                        );
                      })()
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {new Date(syllabus.createdAt).toLocaleDateString('uk-UA')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(syllabus.createdAt).toLocaleTimeString('uk-UA')}
                    </Typography>
                  </TableCell>
                  <TableCell>
          {syllabus.analysis?.templateCompliance?.score ? (
                      <Chip
            label={`${syllabus.analysis.templateCompliance.score}%`}
            color={syllabus.analysis.templateCompliance.score >= 80 ? 'success' : 
                 syllabus.analysis.templateCompliance.score >= 60 ? 'warning' : 'error'}
                        size="small"
                      />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        —
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <Tooltip title="Переглянути аналіз">
                        <IconButton
                          size="small"
                          onClick={() => navigate(`/syllabi/${syllabus._id}`)}
                          disabled={syllabus.status !== 'analyzed'}
                        >
                          {Array.isArray(syllabus.recommendations) ? (
                            (() => {
                              const pending = syllabus.recommendations.filter(r => r.status === 'pending').length;
                              return (
                                <Badge color="warning" badgeContent={pending} invisible={pending === 0} overlap="circular">
                                  <Analytics />
                                </Badge>
                              );
                            })()
                          ) : (
                            <Analytics />
                          )}
                        </IconButton>
                      </Tooltip>
                      
                      {syllabus.status === 'pending' && (
                        <Tooltip title="Аналізувати">
                          <IconButton
                            size="small"
                            onClick={() => handleAnalyze(syllabus._id)}
                          >
                            <Psychology />
                          </IconButton>
                        </Tooltip>
                      )}

                      <Tooltip title="Більше дій">
                        <IconButton
                          size="small"
                          onClick={(e) => setMenuAnchor({ element: e.currentTarget, syllabus })}
                        >
                          <MoreVert />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Box sx={{ py: 4 }}>
                    <Description sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary" gutterBottom>
                      Силабуси не знайдено
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {searchTerm || statusFilter ? 
                        'Спробуйте змінити критерії пошуку' : 
                        'Завантажте ваш перший силабус для початку роботи'
                      }
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor.element}
        open={Boolean(menuAnchor.element)}
        onClose={() => setMenuAnchor({ element: null, syllabus: null })}
      >
        <MenuItem onClick={() => {
          setEditDialog({ open: true, syllabus: menuAnchor.syllabus });
          setMenuAnchor({ element: null, syllabus: null });
        }}>
          <ListItemIcon><Edit /></ListItemIcon>
          <ListItemText>Редагувати</ListItemText>
        </MenuItem>
        
        <MenuItem onClick={() => {
          const fileName = menuAnchor.syllabus.originalName || 
                          menuAnchor.syllabus.originalFile?.originalName || 
                          menuAnchor.syllabus.title || 
                          'syllabus';
          handleDownload(menuAnchor.syllabus._id, fileName);
          setMenuAnchor({ element: null, syllabus: null });
        }}>
          <ListItemIcon><Download /></ListItemIcon>
          <ListItemText>Завантажити</ListItemText>
        </MenuItem>
        
        <MenuItem onClick={() => {
          // Перенаправляємо на сторінку аналізу силабусу, де доступні звіти/експорти
          navigate(`/syllabi/${menuAnchor.syllabus._id}`);
          setMenuAnchor({ element: null, syllabus: null });
        }}>
          <ListItemIcon><Analytics /></ListItemIcon>
          <ListItemText>Звіти</ListItemText>
        </MenuItem>
        
        <MenuItem 
          onClick={() => {
            setDeleteDialog({ open: true, syllabus: menuAnchor.syllabus });
            setMenuAnchor({ element: null, syllabus: null });
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon><Delete color="error" /></ListItemIcon>
          <ListItemText>Видалити</ListItemText>
        </MenuItem>
      </Menu>

      {/* Delete Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, syllabus: null })}
      >
        <DialogTitle>Підтвердити видалення</DialogTitle>
        <DialogContent>
          <Typography>
            Ви впевнені, що хочете видалити силабус "{deleteDialog.syllabus?.originalName}"?
            Ця дія незворотна.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, syllabus: null })}>
            Скасувати
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Видалити
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <EditSyllabusDialog
        open={editDialog.open}
        syllabus={editDialog.syllabus}
        onClose={() => setEditDialog({ open: false, syllabus: null })}
        onSave={handleEdit}
      />
    </Box>
  );
};

// Edit Dialog Component
const EditSyllabusDialog = ({ open, syllabus, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    courseName: '',
    courseCode: '',
    description: '',
  });

  useEffect(() => {
    if (syllabus) {
      setFormData({
        courseName: syllabus.courseName || '',
        courseCode: syllabus.courseCode || '',
        description: syllabus.description || '',
      });
    }
  }, [syllabus]);

  const handleSubmit = () => {
    onSave(formData);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Редагувати силабус</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="Назва курсу"
          value={formData.courseName}
          onChange={(e) => setFormData({ ...formData, courseName: e.target.value })}
          margin="normal"
        />
        <TextField
          fullWidth
          label="Код курсу"
          value={formData.courseCode}
          onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })}
          margin="normal"
        />
        <TextField
          fullWidth
          label="Опис"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          margin="normal"
          multiline
          rows={3}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Скасувати</Button>
        <Button onClick={handleSubmit} variant="contained">Зберегти</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SyllabiList;
