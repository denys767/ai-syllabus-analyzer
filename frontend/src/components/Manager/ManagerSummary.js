import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, List,
  ListItem, ListItemText, CircularProgress, Alert,
  Divider
} from '@mui/material';
import {
  CheckCircle, Cancel, Pending, Comment, Assessment,
  TrendingUp, School, People
} from '@mui/icons-material';
import api from '../../services/api';

const ManagerSummary = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const response = await api.reports.getManagerSummary();
      setSummary(response.data.summary);
    } catch (err) {
      setError('Не вдалося завантажити звіт');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!summary) {
    return <Typography>Немає даних для відображення</Typography>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 4 }}>
        Менеджерський звіт (розділ 2.4 ТЗ)
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Згенеровано: {new Date(summary.generatedAt).toLocaleString('uk-UA')}
      </Typography>

      {/* Summary of Changes */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <Assessment sx={{ mr: 1 }} />
                Загальне самарі змін
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <CheckCircle color="success" sx={{ fontSize: 40 }} />
                    <Typography variant="h4" color="success.main">
                      {summary.summaryOfChanges.totalAccepted}
                    </Typography>
                    <Typography variant="body2">Прийнято</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Cancel color="error" sx={{ fontSize: 40 }} />
                    <Typography variant="h4" color="error.main">
                      {summary.summaryOfChanges.totalRejected}
                    </Typography>
                    <Typography variant="body2">Відхилено</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Pending color="warning" sx={{ fontSize: 40 }} />
                    <Typography variant="h4" color="warning.main">
                      {summary.summaryOfChanges.totalPending}
                    </Typography>
                    <Typography variant="body2">Очікує</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Comment color="info" sx={{ fontSize: 40 }} />
                    <Typography variant="h4" color="info.main">
                      {summary.summaryOfChanges.totalCommented}
                    </Typography>
                    <Typography variant="body2">Прокоментовано</Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Learning Outcomes Alignment */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Відповідність навчальним цілям MBA
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <TrendingUp sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h5" color="primary.main">
                  {summary.learningOutcomesAlignment.averageScore ? 
                    summary.learningOutcomesAlignment.averageScore.toFixed(1) + '%' : 
                    'Н/Д'
                  }
                </Typography>
                <Typography variant="body2" sx={{ ml: 1 }}>
                  середня відповідність
                </Typography>
              </Box>

              <Typography variant="subtitle2" gutterBottom>
                Покриті цілі ({(summary.learningOutcomesAlignment.coveredObjectives || []).length}):
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                {(summary.learningOutcomesAlignment.coveredObjectives || []).slice(0, 10).map((objective, index) => (
                  <Chip key={index} label={objective.substring(0, 30)} size="small" color="success" />
                ))}
                {(!summary.learningOutcomesAlignment.coveredObjectives || summary.learningOutcomesAlignment.coveredObjectives.length === 0) && (
                  <Typography variant="body2" color="text.secondary">Немає даних</Typography>
                )}
              </Box>

              <Typography variant="subtitle2" gutterBottom>
                Прогалини ({(summary.learningOutcomesAlignment.gaps || []).length}):
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {(summary.learningOutcomesAlignment.gaps || []).slice(0, 10).map((gap, index) => (
                  <Chip key={index} label={gap.substring(0, 30)} size="small" color="warning" />
                ))}
                {(!summary.learningOutcomesAlignment.gaps || summary.learningOutcomesAlignment.gaps.length === 0) && (
                  <Typography variant="body2" color="text.secondary">Немає даних</Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <School sx={{ mr: 1 }} />
                Практичність та інтерактивність
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <People sx={{ mr: 1, color: 'secondary.main' }} />
                <Typography variant="h6">
                  {summary.practicalityAndInteractivity.totalChallengesCompleted || 0} / {summary.totalSyllabi || 0}
                </Typography>
                <Typography variant="body2" sx={{ ml: 1 }}>
                  завершених AI-челенджів
                </Typography>
              </Box>

              <Typography variant="body2" sx={{ mb: 2 }}>
                Загальна кількість AI пропозицій: {summary.practicalityAndInteractivity.aiSuggestionsCount || 0}
              </Typography>

              <Typography variant="subtitle2" gutterBottom>
                Топ пропозицій AI:
              </Typography>
              <List dense sx={{ maxHeight: 200, overflow: 'auto' }}>
                {(summary.practicalityAndInteractivity.topSuggestions || []).slice(0, 5).map((suggestion, index) => (
                  <ListItem key={index}>
                    <ListItemText
                      primary={(suggestion.suggestion || 'Немає опису')?.substring(0, 100) + '...'}
                      secondary={suggestion.category || 'Без категорії'}
                    />
                  </ListItem>
                ))}
                {(!summary.practicalityAndInteractivity.topSuggestions || summary.practicalityAndInteractivity.topSuggestions.length === 0) && (
                  <ListItem>
                    <ListItemText primary="Немає AI пропозицій" />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Improvement Proposals */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Пропозиції щодо покращень ({(summary.improvementProposals || []).length})
          </Typography>

          <List sx={{ maxHeight: 400, overflow: 'auto' }}>
            {(summary.improvementProposals || []).map((proposal, index) => (
              <React.Fragment key={index}>
                <ListItem>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip label={proposal.category || 'Без категорії'} size="small" />
                        <Typography variant="subtitle2">{proposal.title || 'Без назви'}</Typography>
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="body2">{proposal.description || 'Без опису'}</Typography>
                        {proposal.instructor && (
                          <Typography variant="caption" color="text.secondary">
                            Викладач: {proposal.instructor.firstName || ''} {proposal.instructor.lastName || ''}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
                {index < (summary.improvementProposals || []).length - 1 && <Divider />}
              </React.Fragment>
            ))}
            {(!summary.improvementProposals || summary.improvementProposals.length === 0) && (
              <ListItem>
                <ListItemText primary="Немає пропозицій щодо покращень" />
              </ListItem>
            )}
          </List>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ManagerSummary;
