import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Paper, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Snackbar, Alert, Tabs, Tab, Chip, CircularProgress
} from '@mui/material';
import {
  People, School, Groups, Poll, Dashboard, Description
} from '@mui/icons-material';
import api from '../../services/api';
import UserManagement from '../../components/Admin/UserManagement';
import ClusterManagement from '../../components/Admin/ClusterManagement';
import SurveyManagement from '../../components/Admin/SurveyManagement';
import PolicyManagement from '../../components/Admin/PolicyManagement';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/admin/dashboard-stats');
      setStats(response.data.stats);
    } catch (err) {
  setError(err.response?.data?.message || 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
      <CircularProgress />
    </Box>
  );

  if (error) return (
    <Box sx={{ p: 3 }}>
      <Alert severity="error">{error}</Alert>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Admin Panel
      </Typography>

      {/* Tab Navigation */}
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={selectedTab} 
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab icon={<Dashboard />} label="Overview" iconPosition="start" />
          <Tab icon={<People />} label="Users" iconPosition="start" />
          <Tab icon={<Groups />} label="Student Clusters" iconPosition="start" />
          <Tab icon={<Poll />} label="Surveys" iconPosition="start" />
          <Tab icon={<Description />} label="Documents" iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {selectedTab === 0 && (
        <Box>
          {/* Overview Statistics */}
          {stats && (
            <>
              <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={4}>
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <People sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                        <Box>
                          <Typography color="textSecondary" gutterBottom>
                            Total Users
                          </Typography>
                          <Typography variant="h4">
                            {stats.users?.total || 0}
                          </Typography>
                          <Typography variant="body2" color="success.main">
                            Active: {stats.users?.active || 0}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <School sx={{ fontSize: 40, color: 'secondary.main', mr: 2 }} />
                        <Box>
                          <Typography color="textSecondary" gutterBottom>
                            Syllabi
                          </Typography>
                          <Typography variant="h4">
                            {stats.syllabi?.total || 0}
                          </Typography>
                          <Typography variant="body2" color="info.main">
                            Analyzed: {stats.syllabi?.analyzed || 0}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
                {/* Removed Average Quality and Survey Responses cards per request */}
              </Grid>

              {/* User Distribution */}
              <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      User Distribution by Role
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {stats.users?.byRole && Object.entries(stats.users.byRole).map(([role, count]) => (
                        <Box key={role} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Chip 
                            label={role === 'instructor' ? 'Instructors' : role === 'admin' ? 'Administrators' : 'Managers'} 
                            color={role === 'instructor' ? 'primary' : role === 'admin' ? 'error' : 'warning'}
                          />
                          <Typography variant="h6">{count}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      System Activity
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography>Uploads today:</Typography>
                        <Typography variant="h6">{stats.activity?.uploadsToday || 0}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography>Analyses this week:</Typography>
                        <Typography variant="h6">{stats.activity?.analysesThisWeek || 0}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography>Active users:</Typography>
                        <Typography variant="h6">{stats.activity?.activeUsers || 0}</Typography>
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              </Grid>

              {/* Recent Activity */}
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Recent Activity
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Syllabus</TableCell>
                        <TableCell>Instructor</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Date</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {stats.recentSyllabi && stats.recentSyllabi.map((syllabus) => (
                        <TableRow key={syllabus._id}>
                          <TableCell>{syllabus.title}</TableCell>
                          <TableCell>
                            {syllabus.uploadedBy ? 
                              `${syllabus.uploadedBy.firstName} ${syllabus.uploadedBy.lastName}` : 
                              'Unknown'
                            }
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={syllabus.status} 
                              color={
                                syllabus.status === 'analyzed' ? 'success' : 
                                syllabus.status === 'processing' ? 'warning' : 'default'
                              }
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            {new Date(syllabus.createdAt).toLocaleDateString('en-US')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </>
          )}
        </Box>
      )}

      {selectedTab === 1 && <UserManagement />}
      {selectedTab === 2 && <ClusterManagement />}
      {selectedTab === 3 && <SurveyManagement />}
      {selectedTab === 4 && <PolicyManagement />}

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

export default AdminDashboard;
