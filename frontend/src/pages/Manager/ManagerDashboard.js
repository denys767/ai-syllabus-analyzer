import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, CircularProgress, Alert, Avatar, IconButton, Tooltip,
  List, ListItem, ListItemText, ListItemAvatar, ToggleButton, ToggleButtonGroup
} from '@mui/material';
import {
  Visibility,
  CheckCircle, Warning, Error, Schedule
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const ManagerDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    totalInstructors: 0,
    totalSyllabi: 0,
    averageQualityScore: 0,
    recentActivity: []
  });
  const [recentSyllabi, setRecentSyllabi] = useState([]);
  const [topInstructors, setTopInstructors] = useState([]);
  const [syllabiScope, setSyllabiScope] = useState('all');
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState('');

  const fetchRecentSyllabiData = async (scope) => {
    if (scope === 'mine') {
      const response = await api.syllabus.getMySyllabi({ limit: 5, page: 1 });
      return response.data?.syllabi || [];
    }
    const response = await api.get('/reports/recent-syllabi', { params: { limit: 5 } });
    return response.data?.syllabi || [];
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setRecentError('');
      
      // Fetch dashboard statistics
      const [analyticsRes, topInstructorsRes, recentData] = await Promise.all([
        api.get('/reports/analytics'),
        api.get('/reports/top-instructors?limit=10'),
        fetchRecentSyllabiData('all')
      ]);

      const analytics = analyticsRes.data.analytics || {};
      setStats({
        totalInstructors: analytics.overview?.totalInstructors || 0,
        totalSyllabi: analytics.overview?.totalSyllabi || 0,
        averageQualityScore: analytics.overview?.averageQualityScore || 0,
        recentActivity: []
      });
      setTopInstructors(topInstructorsRes.data.instructors || []);
      setRecentSyllabi(recentData);
      setSyllabiScope('all');

    } catch (err) {
      setError('Failed to load dashboard data');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleScopeChange = async (_, newScope) => {
    if (!newScope || newScope === syllabiScope) return;
    setSyllabiScope(newScope);
    setRecentLoading(true);
    setRecentError('');
    try {
      const data = await fetchRecentSyllabiData(newScope);
      setRecentSyllabi(data);
    } catch (err) {
      console.error('Recent syllabi toggle error:', err);
      setRecentError('Failed to load recent syllabi');
    } finally {
      setRecentLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'analyzed': return <CheckCircle color="success" />;
      case 'processing': return <Schedule color="warning" />;
      case 'error': return <Error color="error" />;
      default: return <Warning color="action" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'analyzed': return 'Analyzed';
      case 'processing': return 'Processing';
      case 'error': return 'Error';
      default: return 'Pending';
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 4 }}>
        Manager Dashboard
      </Typography>

      {/* Removed 4 statistic boxes per request */}

      <Grid container spacing={3}>
        {/* Recent Syllabi */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6">
                Recent Syllabi
              </Typography>
              <ToggleButtonGroup
                size="small"
                value={syllabiScope}
                exclusive
                onChange={handleScopeChange}
              >
                <ToggleButton value="all">All</ToggleButton>
                <ToggleButton value="mine">My</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Course Title</TableCell>
                    <TableCell>Instructor</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <CircularProgress size={20} />
                      </TableCell>
                    </TableRow>
                  ) : recentError ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography variant="body2" color="error">
                          {recentError}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : recentSyllabi.length > 0 ? (
                    recentSyllabi.map((syllabus) => (
                      <TableRow key={syllabus._id}>
                        <TableCell>
                          <Box>
                            <Typography variant="body2" fontWeight="600">
                              {syllabus.title || syllabus.course?.name || syllabus.courseName || 'Untitled'}
                            </Typography>
                            {(syllabus.course?.code || syllabus.courseCode) && (
                              <Typography variant="caption" color="text.secondary">
                                {syllabus.course?.code || syllabus.courseCode}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          {syllabus.instructor ? (
                            `${syllabus.instructor.firstName || ''} ${syllabus.instructor.lastName || ''}`.trim()
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={getStatusIcon(syllabus.status)}
                            label={getStatusText(syllabus.status)}
                            size="small"
                            color={syllabus.status === 'analyzed' ? 'success' : 
                                   syllabus.status === 'processing' ? 'warning' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          {new Date(syllabus.createdAt).toLocaleDateString('en-US')}
                        </TableCell>
                        <TableCell>
                          <Tooltip title="View">
                            <IconButton 
                              size="small"
                              onClick={() => navigate(`/syllabi/${syllabus._id}`)}
                              disabled={syllabus.status !== 'analyzed'}
                            >
                              <Visibility />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography variant="body2" color="text.secondary">
                          No syllabi found for this scope
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Top Instructors */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Instructors
            </Typography>
            <List>
              {topInstructors.slice(0, 8).map((instructor) => (
                <ListItem key={instructor._id}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'primary.main' }}>
                      {instructor.firstName?.[0]}{instructor.lastName?.[0]}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={`${instructor.firstName} ${instructor.lastName}`}
                    secondary={
                      <Box>
                        <Typography variant="caption" display="block">
                          {instructor.email}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Syllabi: {instructor.syllabusCount || 0}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ManagerDashboard;
