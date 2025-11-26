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
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  Upload,
  Description,
  Analytics,
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
  const isAdmin = user?.role === 'admin';
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
      const syllabiRequest = isAdmin
        ? api.get('/reports/recent-syllabi', { params: { limit: 5 } })
        : api.get('/syllabus/my-syllabi', { params: { limit: 5 } });

      const [statsResponse, syllabiResponse] = await Promise.all([
        api.get('/users/stats'),
        syllabiRequest,
      ]);
      
      setStats(statsResponse.data);
      const list = syllabiResponse.data.syllabi || [];
      setRecentSyllabi(list);
      const pending = isAdmin
        ? 0
        : list.reduce((acc, s) => acc + (Array.isArray(s.recommendations) ? s.recommendations.filter(r => r.status === 'pending').length : 0), 0);
      setPendingTotal(pending);
    } catch (err) {
      setError('Error loading dashboard data');
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
        return 'Analyzed';
      case 'processing':
        return 'Processing';
      case 'error':
        return 'Error';
      default:
        return 'Pending';
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

  // Quick actions section removed per request

  const hasRole = (roles) => {
    return roles.includes(user?.role);
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading dashboard...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Welcome Section */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Typography variant="h4" fontWeight="bold" gutterBottom>
              Hello, {user?.firstName}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Welcome to AI Syllabus Analyzer. Review your syllabi and get AI recommendations.
            </Typography>
          </Box>
          
          {/* Theme switcher removed; centralized in Header */}
        </Box>
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
                    Syllabi
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
                    Analyzed
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

  {/* AI score card removed according to updated requirements */}

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
                    Pending Recommendations
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Quick Actions removed */}

      {/* Recent Syllabi */}
      <Typography variant="h5" fontWeight="bold" gutterBottom>
  Recent Syllabi
      </Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              {isAdmin && <TableCell>Instructor</TableCell>}
              <TableCell>Course</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Date</TableCell>
              <TableCell align="right">Actions</TableCell>
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
                        {syllabus.originalName || syllabus.originalFile?.originalName || syllabus.title || 'Untitled'}
                      </Typography>
                    </Box>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      {syllabus.instructor ? (
                        `${syllabus.instructor.firstName || ''} ${syllabus.instructor.lastName || ''}`.trim()
                      ) : '—'}
                    </TableCell>
                  )}
                  <TableCell>{syllabus.courseName || syllabus.course?.name || syllabus.title || 'N/A'}</TableCell>
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
                          <Chip label={`Pending: ${pending}`} color="warning" size="small" />
                        ) : null;
                      })()}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {new Date(syllabus.createdAt).toLocaleDateString('en-US')}
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
                <TableCell colSpan={isAdmin ? 6 : 5} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                    No syllabi found. {' '}
                    {hasRole(['instructor', 'manager']) && (
                      <Button
                        variant="text"
                        onClick={() => navigate('/syllabi/upload')}
                      >
                        Upload first syllabus
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
