import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Alert, Snackbar, Grid, Card, CardContent,
  Chip, TablePagination, Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import {
  Delete, DeleteForever, Visibility, ExpandMore,
  Poll, TrendingUp, People, DateRange
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from 'recharts';
import api from '../../services/api';

const SurveyManagement = () => {
  const [surveys, setSurveys] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 0, current: 1 });
  const [deleteAllDialog, setDeleteAllDialog] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [detailDialog, setDetailDialog] = useState({ open: false, survey: null });

  const fetchSurveys = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/clusters/surveys?page=${page + 1}&limit=${rowsPerPage}`);
      setSurveys(response.data.surveys);
      setPagination(response.data.pagination);
    } catch (error) {
      setSnackbar({ 
        open: true, 
        message: 'Помилка завантаження опитувань', 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage]);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const response = await api.get('/clusters/surveys/insights');
      setInsights(response.data.insights);
    } catch (error) {
      console.error('Error fetching insights:', error);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSurveys();
    fetchInsights();
  }, [fetchSurveys, fetchInsights]);

  const handleDeleteAllSurveys = async () => {
    try {
      const response = await api.delete('/clusters/surveys/all');
      setSnackbar({ 
        open: true, 
        message: `Видалено ${response.data.deletedCount} відповідей`, 
        severity: 'success' 
      });
      setDeleteAllDialog(false);
      fetchSurveys();
      fetchInsights();
    } catch (error) {
      setSnackbar({ 
        open: true, 
        message: 'Помилка видалення опитувань', 
        severity: 'error' 
      });
    }
  };

  const handleDeleteSurvey = async (surveyId) => {
    try {
      await api.delete(`/clusters/surveys/${surveyId}`);
      setSnackbar({ 
        open: true, 
        message: 'Відповідь видалено', 
        severity: 'success' 
      });
      fetchSurveys();
      fetchInsights();
    } catch (error) {
      setSnackbar({ 
        open: true, 
        message: 'Помилка видалення', 
        severity: 'error' 
      });
    }
  };

  const handleViewDetails = (survey) => {
    setDetailDialog({ open: true, survey });
  };

  const formatInsightsData = (insights) => {
    if (!insights) return [];
    
    return insights.commonChallenges.slice(0, 10).map(item => ({
      name: item.theme,
      frequency: item.frequency
    }));
  };

  const formatResponsesByMonth = (insights) => {
    if (!insights || !insights.responsesByMonth) return [];
    
    return insights.responsesByMonth.map(item => ({
      month: item.month,
      responses: item.count
    }));
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Управління опитуваннями
        </Typography>
        <Button
          variant="contained"
          color="error"
          startIcon={<DeleteForever />}
          onClick={() => setDeleteAllDialog(true)}
          disabled={surveys.length === 0}
        >
          Очистити всі відповіді
        </Button>
      </Box>

      {/* Insights Dashboard */}
      {insights && !insightsLoading && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" gutterBottom>
            Аналітика опитувань
          </Typography>
          
          {/* Summary Cards */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Poll sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                    <Box>
                      <Typography color="textSecondary" gutterBottom>
                        Всього відповідей
                      </Typography>
                      <Typography variant="h4">
                        {insights.totalResponses}
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
                    <TrendingUp sx={{ fontSize: 40, color: 'success.main', mr: 2 }} />
                    <Box>
                      <Typography color="textSecondary" gutterBottom>
                        Популярних тем
                      </Typography>
                      <Typography variant="h4">
                        {insights.commonChallenges.length}
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
                        Стилів навчання
                      </Typography>
                      <Typography variant="h4">
                        {insights.learningPreferences.length}
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
                    <DateRange sx={{ fontSize: 40, color: 'warning.main', mr: 2 }} />
                    <Box>
                      <Typography color="textSecondary" gutterBottom>
                        Остання відповідь
                      </Typography>
                      <Typography variant="h6">
                        {insights.lastUpdated ? 
                          new Date(insights.lastUpdated).toLocaleDateString('uk-UA') : 
                          'Немає'
                        }
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Charts */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Найпоширеніші виклики
                </Typography>
                {formatInsightsData(insights).length > 0 ? (
                  <BarChart width={400} height={300} data={formatInsightsData(insights)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="frequency" fill="#8884d8" />
                  </BarChart>
                ) : (
                  <Typography>Немає даних для відображення</Typography>
                )}
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Відповіді за місяцями
                </Typography>
                {formatResponsesByMonth(insights).length > 0 ? (
                  <LineChart width={400} height={300} data={formatResponsesByMonth(insights)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="responses" stroke="#8884d8" />
                  </LineChart>
                ) : (
                  <Typography>Немає даних для відображення</Typography>
                )}
              </Paper>
            </Grid>
          </Grid>

          {/* Detailed Insights */}
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Детальна аналітика
            </Typography>
            
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography>Найпоширеніші виклики</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {insights.commonChallenges.slice(0, 20).map((challenge, index) => (
                    <Chip 
                      key={index}
                      label={`${challenge.theme} (${challenge.frequency})`}
                      variant="outlined"
                      size="small"
                    />
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography>Типи рішень</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {insights.decisionTypes.slice(0, 20).map((decision, index) => (
                    <Chip 
                      key={index}
                      label={`${decision.theme} (${decision.frequency})`}
                      variant="outlined"
                      size="small"
                      color="secondary"
                    />
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography>Переваги в навчанні</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {insights.learningPreferences.slice(0, 20).map((preference, index) => (
                    <Chip 
                      key={index}
                      label={`${preference.theme} (${preference.frequency})`}
                      variant="outlined"
                      size="small"
                      color="success"
                    />
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          </Paper>
        </Box>
      )}

      {/* Survey Responses Table */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Відповіді на опитування
        </Typography>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Ім'я</TableCell>
                    <TableCell>Прізвище</TableCell>
                    <TableCell>Виклик</TableCell>
                    <TableCell>Дата відповіді</TableCell>
                    <TableCell>Дії</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {surveys.map((survey) => (
                    <TableRow key={survey._id}>
                      <TableCell>{survey.firstName}</TableCell>
                      <TableCell>{survey.lastName}</TableCell>
                      <TableCell>
                        {survey.challenge ? 
                          `${survey.challenge.substring(0, 50)}...` : 
                          'Не вказано'
                        }
                      </TableCell>
                      <TableCell>
                        {new Date(survey.createdAt).toLocaleDateString('uk-UA')}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          startIcon={<Visibility />}
                          onClick={() => handleViewDetails(survey)}
                        >
                          Деталі
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<Delete />}
                          onClick={() => handleDeleteSurvey(survey._id)}
                        >
                          Видалити
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              rowsPerPageOptions={[5, 10, 25]}
              component="div"
              count={pagination.total}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={(e, newPage) => setPage(newPage)}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
            />
          </>
        )}
      </Paper>

      {/* Delete All Confirmation Dialog */}
      <Dialog open={deleteAllDialog} onClose={() => setDeleteAllDialog(false)}>
        <DialogTitle>Підтвердження видалення</DialogTitle>
        <DialogContent>
          <Typography>
            Ви впевнені, що хочете видалити всі відповіді на опитування? 
            Цю дію не можна скасувати.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAllDialog(false)}>Скасувати</Button>
          <Button onClick={handleDeleteAllSurveys} color="error" variant="contained">
            Видалити всі
          </Button>
        </DialogActions>
      </Dialog>

      {/* Survey Detail Dialog */}
      <Dialog 
        open={detailDialog.open} 
        onClose={() => setDetailDialog({ open: false, survey: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Деталі відповіді</DialogTitle>
        <DialogContent>
          {detailDialog.survey && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Ім'я:</Typography>
                  <Typography>{detailDialog.survey.firstName}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Прізвище:</Typography>
                  <Typography>{detailDialog.survey.lastName}</Typography>
                </Grid>
              </Grid>
              
              <Box>
                <Typography variant="subtitle2">Найбільший виклик:</Typography>
                <Typography>{detailDialog.survey.challenge || 'Не вказано'}</Typography>
              </Box>
              
              <Box>
                <Typography variant="subtitle2">Типи рішень:</Typography>
                <Typography>{detailDialog.survey.decisions || 'Не вказано'}</Typography>
              </Box>
              
              <Box>
                <Typography variant="subtitle2">Ситуація з минулого місяця:</Typography>
                <Typography>{detailDialog.survey.situation || 'Не вказано'}</Typography>
              </Box>
              
              <Box>
                <Typography variant="subtitle2">Досвід:</Typography>
                <Typography>{detailDialog.survey.experience || 'Не вказано'}</Typography>
              </Box>
              
              <Box>
                <Typography variant="subtitle2">Стиль навчання:</Typography>
                <Typography>{detailDialog.survey.learningStyle || 'Не вказано'}</Typography>
              </Box>
              
              <Box>
                <Typography variant="subtitle2">Дата відповіді:</Typography>
                <Typography>{new Date(detailDialog.survey.createdAt).toLocaleString('uk-UA')}</Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog({ open: false, survey: null })}>
            Закрити
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

export default SurveyManagement;
