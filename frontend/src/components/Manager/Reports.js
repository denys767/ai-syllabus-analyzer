import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, CircularProgress, Grid, Card, CardContent,
  FormControl, InputLabel, Select, MenuItem, Button, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import {
  Download, TrendingUp, People, School, Analytics,
  CheckCircle, Warning, Error, Schedule
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import api from '../../services/api';

const Reports = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('6months');
  const [department, setDepartment] = useState('');
  const [exportDialog, setExportDialog] = useState(false);
  const [exportType, setExportType] = useState('csv');
  const [exporting, setExporting] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (timeRange) params.append('timeRange', timeRange);
      if (department) params.append('department', department);

      const response = await api.get(`/reports/analytics?${params.toString()}`);
      setAnalytics(response.data.analytics);
    } catch (err) {
      setError(err.response?.data?.message || 'Не вдалося завантажити аналітику');
    } finally {
      setLoading(false);
    }
  }, [timeRange, department]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (timeRange) params.append('timeRange', timeRange);
      if (department) params.append('department', department);

      const response = await api.get(`/reports/export/${exportType}?${params.toString()}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const extension = exportType === 'excel' ? 'xlsx' : exportType;
      link.setAttribute('download', `syllabi-report-${Date.now()}.${extension}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setExportDialog(false);
    } catch (err) {
      setError('Помилка експорту звіту');
    } finally {
      setExporting(false);
    }
  };

  const formatQualityDistributionData = (distribution) => {
    return [
      { name: 'Відмінно (90-100%)', value: distribution.excellent, color: '#4CAF50' },
      { name: 'Добре (80-89%)', value: distribution.good, color: '#8BC34A' },
      { name: 'Задовільно (70-79%)', value: distribution.satisfactory, color: '#FFC107' },
      { name: 'Потребує покращення (60-69%)', value: distribution.needsImprovement, color: '#FF9800' },
      { name: 'Незадовільно (<60%)', value: distribution.poor, color: '#F44336' }
    ];
  };

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
      <CircularProgress />
    </Box>
  );

  if (error) return <Alert severity="error">{error}</Alert>;
  
  if (!analytics) return <Typography>Немає даних для відображення.</Typography>;

  // Derived rejection rate
  const rejectedTotal = analytics?.recommendationAnalytics?.byCategory ? Object.values(analytics.recommendationAnalytics.byCategory).reduce((sum,c)=> sum + (c.rejected||0),0) : 0;
  const rejectionRate = analytics?.recommendationAnalytics?.totalRecommendations > 0 ? Math.round((rejectedTotal / analytics.recommendationAnalytics.totalRecommendations)*100) : 0;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" gutterBottom>Звіти та аналітика</Typography>
        <Button
          variant="contained"
          startIcon={<Download />}
          onClick={() => setExportDialog(true)}
        >
          Експорт
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Період</InputLabel>
              <Select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                label="Період"
              >
                <MenuItem value="1month">Останній місяць</MenuItem>
                <MenuItem value="3months">Останні 3 місяці</MenuItem>
                <MenuItem value="6months">Останні 6 місяців</MenuItem>
                <MenuItem value="1year">Останній рік</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Кафедра</InputLabel>
              <Select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                label="Кафедра"
              >
                <MenuItem value="">Всі кафедри</MenuItem>
                <MenuItem value="Management">Менеджмент</MenuItem>
                <MenuItem value="Finance">Фінанси</MenuItem>
                <MenuItem value="Marketing">Маркетинг</MenuItem>
                <MenuItem value="IT">ІТ</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Overview Statistics */}
  <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <School sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Всього силабусів
                  </Typography>
                  <Typography variant="h4">
                    {analytics.overview.totalSyllabi}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <People sx={{ fontSize: 40, color: 'secondary.main', mr: 2 }} />
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Активні викладачі
                  </Typography>
                  <Typography variant="h4">
                    {analytics.overview.totalInstructors}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Analytics sx={{ fontSize: 40, color: 'success.main', mr: 2 }} />
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Середня оцінка
                  </Typography>
                  <Typography variant="h4">
                    {analytics.overview.averageQualityScore}%
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <TrendingUp sx={{ fontSize: 40, color: 'warning.main', mr: 2 }} />
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Частка прийнятих рекомендацій
                  </Typography>
                  <Typography variant="h4">
                    {analytics.recommendationAnalytics.acceptanceRate}%
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <TrendingUp sx={{ fontSize: 40, color: 'error.main', mr: 2 }} />
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Частка відхилених рекомендацій
                  </Typography>
                  <Typography variant="h4">
                    {rejectionRate}%
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts */}
  <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Quality Distribution */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Розподіл за якістю
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <PieChart width={300} height={250}>
                <Pie
                  data={formatQualityDistributionData(analytics.syllabusAnalytics.qualityDistribution)}
                  cx={150}
                  cy={125}
                  outerRadius={80}
                  dataKey="value"
                >
                  {formatQualityDistributionData(analytics.syllabusAnalytics.qualityDistribution).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </Box>
          </Paper>
        </Grid>

        {/* Status Distribution */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Статус силабусів
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <BarChart width={300} height={250} data={Object.entries(analytics.syllabusAnalytics.byStatus).map(([status, count]) => ({
                status,
                count
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Recommendation statuses stacked bar */}
      <Paper sx={{ p:3, mb:4 }}>
        <Typography variant="h6" gutterBottom>
          Статуси рекомендацій (агреговано)
        </Typography>
        <Box sx={{ display:'flex', justifyContent:'center' }}>
          <BarChart width={500} height={280} data={[
            {
              name: 'Рекомендації',
              accepted: analytics.recommendationAnalytics.byCategory ? Object.values(analytics.recommendationAnalytics.byCategory).reduce((a,c)=> a + (c.accepted||0),0) : 0,
              rejected: analytics.recommendationAnalytics.byCategory ? Object.values(analytics.recommendationAnalytics.byCategory).reduce((a,c)=> a + (c.rejected||0),0) : 0,
              pending: analytics.recommendationAnalytics.byCategory ? Object.values(analytics.recommendationAnalytics.byCategory).reduce((a,c)=> a + (c.pending||0),0) : 0
            }
          ]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="accepted" stackId="a" fill="#4caf50" name="Прийняті" />
            <Bar dataKey="rejected" stackId="a" fill="#f44336" name="Відхилені" />
            <Bar dataKey="pending" stackId="a" fill="#ffb300" name="Очікують" />
          </BarChart>
        </Box>
      </Paper>

      {/* Time Series Chart */}
      {analytics.timeSeriesData && analytics.timeSeriesData.length > 0 && (
        <Paper sx={{ p: 3, mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Динаміка завантажень за місяцями
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <LineChart width={800} height={300} data={analytics.timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="syllabusCount" stroke="#8884d8" name="Кількість силабусів" />
              <Line type="monotone" dataKey="averageQuality" stroke="#82ca9d" name="Середня якість" />
            </LineChart>
          </Box>
        </Paper>
      )}

      {/* Common Issues */}
      {analytics.syllabusAnalytics.commonIssues && analytics.syllabusAnalytics.commonIssues.length > 0 && (
        <Paper sx={{ p: 3, mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Найпоширеніші проблеми
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Проблема</TableCell>
                  <TableCell>Кількість випадків</TableCell>
                  <TableCell>Відсоток</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {analytics.syllabusAnalytics.commonIssues.map((issue, index) => (
                  <TableRow key={index}>
                    <TableCell>{issue.issue}</TableCell>
                    <TableCell>{issue.count}</TableCell>
                    <TableCell>
                      {Math.round((issue.count / analytics.overview.totalSyllabi) * 100)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Export Dialog */}
      <Dialog open={exportDialog} onClose={() => setExportDialog(false)}>
        <DialogTitle>Експорт звіту</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Формат</InputLabel>
            <Select
              value={exportType}
              onChange={(e) => setExportType(e.target.value)}
              label="Формат"
            >
              <MenuItem value="csv">CSV</MenuItem>
              <MenuItem value="excel">Excel</MenuItem>
              <MenuItem value="pdf">PDF</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportDialog(false)}>Скасувати</Button>
          <Button 
            onClick={handleExport} 
            variant="contained"
            disabled={exporting}
          >
            {exporting ? <CircularProgress size={24} /> : 'Експортувати'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Reports;
