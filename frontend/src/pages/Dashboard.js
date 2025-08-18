import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Avatar,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Alert,
  Badge,
} from '@mui/material';
import {
  Upload,
  Description,
  Analytics,
  TrendingUp,
  CheckCircle,
  Warning,
  Error,
  Visibility,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState({});
  const [recentSyllabi, setRecentSyllabi] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [statsResponse, syllabiResponse] = await Promise.all([
        api.get('/users/stats'),
        api.get('/syllabus/my-syllabi?limit=5'),
      ]);
      
  setStats(statsResponse.data);
  const list = syllabiResponse.data.syllabi || [];
  setRecentSyllabi(list);
  const pending = list.reduce((acc, s) => acc + (Array.isArray(s.recommendations) ? s.recommendations.filter(r => r.status === 'pending').length : 0), 0);
  setPendingTotal(pending);
    } catch (err) {
      setError('Помилка завантаження даних дашборда');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'analyzed':
        return <CheckCircle color="success" />;
      case 'processing':
        return <Warning color="warning" />;
      case 'error':
        return <Error color="error" />;
      default:
        return <Description color="action" />;
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

  const quickActions = [
    {
      title: 'Завантажити силабус',
      description: 'Додати новий силабус для аналізу',
      icon: <Upload />,
      color: 'primary',
      path: '/syllabi/upload',
      roles: ['instructor'],
    },
    {
      title: 'Переглянути силабуси',
      description: 'Керувати завантаженими силабусами',
      icon: <Description />,
      color: 'secondary',
      path: '/syllabi',
      roles: ['instructor', 'admin', 'manager'],
    },
    // Опитування: немає окремої сторінки у фронтенді, приховано для всіх ролей
    // AI Challenger moved into per-syllabus view, no global entry
    {
      title: 'Звіти',
      description: 'Переглянути аналітику та звіти',
      icon: <Analytics />,
      color: 'warning',
      // Спрямовуємо на сторінку менеджера; доступна і для admin
      path: '/manager/reports',
      roles: ['manager', 'admin'],
    },
  ];

  const hasRole = (roles) => {
    return roles.includes(user?.role);
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Завантаження дашборда...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Welcome Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Привіт, {user?.firstName}! 👋
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Ласкаво просимо в AI Syllabus Analyzer. Переглядайте ваші силабуси та отримуйте рекомендації від AI.
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                  <Description />
                </Avatar>
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.totalSyllabi || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Силабуси
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                  <CheckCircle />
                </Avatar>
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.analyzedSyllabi || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Проаналізовано
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

  <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'warning.main', mr: 2 }}>
                  <TrendingUp />
                </Avatar>
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.aiScore || 0}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    AI Оцінка
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Pending decisions */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'secondary.main', mr: 2 }}>
                  <Analytics />
                </Avatar>
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {pendingTotal}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Рекомендації в очікуванні
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Quick Actions */}
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Швидкі дії
      </Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {quickActions
          .filter(action => hasRole(action.roles))
          .map((action, index) => (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <Card 
                sx={{ 
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 4,
                  },
                }}
                onClick={() => navigate(action.path)}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Avatar sx={{ bgcolor: `${action.color}.main`, mr: 2 }}>
                      {action.icon}
                    </Avatar>
                    <Box>
                      <Typography variant="h6" fontWeight="600">
                        {action.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {action.description}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
      </Grid>

      {/* Recent Syllabi */}
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Останні силабуси
      </Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Назва</TableCell>
              <TableCell>Курс</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Дата</TableCell>
              <TableCell align="right">Дії</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recentSyllabi.length > 0 ? (
              recentSyllabi.map((syllabus) => (
                <TableRow key={syllabus._id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      {getStatusIcon(syllabus.status)}
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        {syllabus.originalName || syllabus.originalFile?.originalName || syllabus.title || 'Без назви'}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{syllabus.courseName || syllabus.course?.name || syllabus.title || 'Не вказано'}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Chip
                        label={getStatusText(syllabus.status)}
                        color={getStatusColor(syllabus.status)}
                        size="small"
                      />
                      {Array.isArray(syllabus.recommendations) && syllabus.recommendations.length > 0 && (() => {
                        const pending = syllabus.recommendations.filter(r => r.status === 'pending').length;
                        return pending > 0 ? (
                          <Chip label={`Очікує: ${pending}`} color="warning" size="small" />
                        ) : null;
                      })()}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {new Date(syllabus.createdAt).toLocaleDateString('uk-UA')}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => navigate(`/syllabi/${syllabus._id}`)}>
                      {Array.isArray(syllabus.recommendations) ? (() => {
                        const pending = syllabus.recommendations.filter(r => r.status === 'pending').length;
                        return (
                          <Badge color="warning" badgeContent={pending} invisible={pending === 0} overlap="circular">
                            <Visibility />
                          </Badge>
                        );
                      })() : (
                        <Visibility />
                      )}
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                    Силабуси не знайдено. {' '}
                    {hasRole(['instructor']) && (
                      <Button
                        variant="text"
                        onClick={() => navigate('/syllabi/upload')}
                      >
                        Завантажити перший силабус
                      </Button>
                    )}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default Dashboard;
