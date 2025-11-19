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
      setError('Failed to load report');
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
    return <Typography>No data to display</Typography>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 4 }}>
        Manager Report
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Generated: {new Date(summary.generatedAt).toLocaleString('en-US')}
      </Typography>

      {/* Summary of Changes */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <Assessment sx={{ mr: 1 }} />
                General Summary of Changes
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <CheckCircle color="success" sx={{ fontSize: 40 }} />
                    <Typography variant="h4" color="success.main">
                      {summary.summaryOfChanges.totalAccepted}
                    </Typography>
                    <Typography variant="body2">Accepted</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Cancel color="error" sx={{ fontSize: 40 }} />
                    <Typography variant="h4" color="error.main">
                      {summary.summaryOfChanges.totalRejected}
                    </Typography>
                    <Typography variant="body2">Rejected</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Pending color="warning" sx={{ fontSize: 40 }} />
                    <Typography variant="h4" color="warning.main">
                      {summary.summaryOfChanges.totalPending}
                    </Typography>
                    <Typography variant="body2">Pending</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Comment color="info" sx={{ fontSize: 40 }} />
                    <Typography variant="h4" color="info.main">
                      {summary.summaryOfChanges.totalCommented}
                    </Typography>
                    <Typography variant="body2">Commented</Typography>
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
                MBA Learning Outcomes Alignment
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <TrendingUp sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h5" color="primary.main">
                  {summary.learningOutcomesAlignment.averageScore ? 
                    summary.learningOutcomesAlignment.averageScore.toFixed(1) + '%' : 
                    'N/A'
                  }
                </Typography>
                <Typography variant="body2" sx={{ ml: 1 }}>
                  average compliance
                </Typography>
              </Box>

              <Typography variant="subtitle2" gutterBottom>
                Covered outcomes ({(summary.learningOutcomesAlignment.coveredObjectives || []).length}):
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                {(summary.learningOutcomesAlignment.coveredObjectives || []).slice(0, 10).map((objective, index) => (
                  <Chip key={index} label={objective.substring(0, 30)} size="small" color="success" />
                ))}
                {(!summary.learningOutcomesAlignment.coveredObjectives || summary.learningOutcomesAlignment.coveredObjectives.length === 0) && (
                  <Typography variant="body2" color="text.secondary">No data</Typography>
                )}
              </Box>

              <Typography variant="subtitle2" gutterBottom>
                Outcome gaps ({(summary.learningOutcomesAlignment.gaps || []).length}):
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {(summary.learningOutcomesAlignment.gaps || []).slice(0, 10).map((gap, index) => (
                  <Chip key={index} label={gap.substring(0, 30)} size="small" color="warning" />
                ))}
                {(!summary.learningOutcomesAlignment.gaps || summary.learningOutcomesAlignment.gaps.length === 0) && (
                  <Typography variant="body2" color="text.secondary">No data</Typography>
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
                Practicality and Interactivity
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <People sx={{ mr: 1, color: 'secondary.main' }} />
                <Typography variant="h6">
                  {summary.practicalityAndInteractivity.totalChallengesCompleted || 0} / {summary.totalSyllabi || 0}
                </Typography>
                <Typography variant="body2" sx={{ ml: 1 }}>
                  completed AI challenges
                </Typography>
              </Box>

              <Typography variant="body2" sx={{ mb: 2 }}>
                Total number of AI suggestions: {summary.practicalityAndInteractivity.aiSuggestionsCount || 0}
              </Typography>

              <Typography variant="subtitle2" gutterBottom>
                Top AI suggestions:
              </Typography>
              <List dense sx={{ maxHeight: 200, overflow: 'auto' }}>
                {(summary.practicalityAndInteractivity.topSuggestions || []).slice(0, 5).map((suggestion, index) => (
                  <ListItem key={index}>
                    <ListItemText
                      primary={(suggestion.suggestion || 'No description')?.substring(0, 100) + '...'}
                      secondary={suggestion.category || 'No category'}
                    />
                  </ListItem>
                ))}
                {(!summary.practicalityAndInteractivity.topSuggestions || summary.practicalityAndInteractivity.topSuggestions.length === 0) && (
                  <ListItem>
                    <ListItemText primary="No AI suggestions" />
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
            Improvement Proposals ({(summary.improvementProposals || []).length})
          </Typography>

          <List sx={{ maxHeight: 400, overflow: 'auto' }}>
            {(summary.improvementProposals || []).map((proposal, index) => (
              <React.Fragment key={index}>
                <ListItem>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip label={proposal.category || 'No category'} size="small" />
                        <Typography variant="subtitle2">{proposal.title || 'No title'}</Typography>
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="body2">{proposal.description || 'No description'}</Typography>
                        {proposal.instructor && (
                          <Typography variant="caption" color="text.secondary">
                            Instructor: {proposal.instructor.firstName || ''} {proposal.instructor.lastName || ''}
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
                <ListItemText primary="No improvement proposals" />
              </ListItem>
            )}
          </List>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ManagerSummary;
