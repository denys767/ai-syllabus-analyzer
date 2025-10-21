import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, List,
  ListItem, ListItemText, CircularProgress, Alert, Divider,
  Accordion, AccordionSummary, AccordionDetails, Button
} from '@mui/material';
import {
  CheckCircle, Cancel, Pending, Comment, ExpandMore,
  Description, Person, CalendarToday, Download
} from '@mui/icons-material';
import api from '../../services/api';
import { useNavigate } from 'react-router-dom';

const ManagerReports = () => {
  const [syllabi, setSyllabi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedPanel, setExpandedPanel] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      // Load all analyzed syllabi through catalog endpoint
      const response = await api.syllabus.getAll();
      const catalogItems = response.data.items || [];
      
      // Load full data for each syllabus
      const detailedSyllabi = await Promise.all(
        catalogItems.map(async (item) => {
          try {
            const detailRes = await api.syllabus.getSyllabus(item.id);
            // Backend returns the syllabus object directly (not wrapped under { syllabus })
            return detailRes.data;
          } catch (err) {
            console.error(`Error loading syllabus ${item.id}:`, err);
            return null;
          }
        })
      );
      
      // Filter null values
      setSyllabi(detailedSyllabi.filter(Boolean));
    } catch (err) {
      setError('Failed to load reports');
      console.error('Load reports error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccordionChange = (panel) => (event, isExpanded) => {
    setExpandedPanel(isExpanded ? panel : false);
  };

  const downloadPdf = async (syllabusId) => {
    try {
      await api.syllabus.downloadEditedPdf(syllabusId);
    } catch (err) {
      console.error('PDF download error:', err);
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

  if (syllabi.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>Syllabus Reports</Typography>
        <Alert severity="info">No analyzed syllabi to display</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h4" gutterBottom sx={{ mb: { xs: 2, sm: 4 }, fontSize: { xs: '1.75rem', sm: '2.125rem' } }}>
        Syllabus Reports
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, fontSize: { xs: '0.875rem', sm: '0.875rem' } }}>
        Analytical reports for each syllabus after completing the onboarding process
      </Typography>

      {syllabi.map((syllabus) => {
        const accepted = (syllabus.recommendations || []).filter(r => r.status === 'accepted');
        const rejected = (syllabus.recommendations || []).filter(r => r.status === 'rejected');
        const pending = (syllabus.recommendations || []).filter(r => r.status === 'pending');
        const commented = (syllabus.recommendations || []).filter(r => r.status === 'commented');

        const coveredObjectives = syllabus.analysis?.learningObjectivesAlignment?.alignedObjectives || [];
        const gaps = syllabus.analysis?.learningObjectivesAlignment?.missingObjectives || [];
        const totalObjectives = coveredObjectives.length + gaps.length;
        const coverageScore = totalObjectives > 0 
          ? ((coveredObjectives.length / totalObjectives) * 100).toFixed(1) 
          : 0;

        const challengeCompleted = syllabus.practicalChallenge?.status === 'completed';
        const aiSuggestions = syllabus.practicalChallenge?.aiSuggestions || [];

        return (
          <Accordion 
            key={syllabus._id}
            expanded={expandedPanel === syllabus._id}
            onChange={handleAccordionChange(syllabus._id)}
            sx={{ mb: 2 }}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: { xs: 1, sm: 2 }, flexWrap: 'wrap' }}>
                <Description color="primary" />
                <Box sx={{ flexGrow: 1, minWidth: { xs: '150px', sm: 'auto' } }}>
                  <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                    {syllabus.title || syllabus.course?.name || 'Untitled'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: { xs: '0.7rem', sm: '0.75rem' } }}>
                    <Person sx={{ fontSize: { xs: 12, sm: 14 }, verticalAlign: 'middle', mr: 0.5 }} />
                    {syllabus.instructor?.firstName} {syllabus.instructor?.lastName}
                    <CalendarToday sx={{ fontSize: { xs: 12, sm: 14 }, verticalAlign: 'middle', ml: { xs: 1, sm: 2 }, mr: 0.5 }} />
                    {new Date(syllabus.createdAt).toLocaleDateString('en-US')}
                  </Typography>
                </Box>
                <Chip 
                  label={`${accepted.length} accepted`} 
                  color="success" 
                  size="small" 
                />
              </Box>
            </AccordionSummary>

            <AccordionDetails>
              <Grid container spacing={{ xs: 2, sm: 3 }}>
                {/* 1. Overall Changes Summary */}
                <Grid item xs={12}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                        📊 Overall Changes Summary
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
                        Changes made during syllabus editing based on accepted recommendations
                      </Typography>
                      
                      <Grid container spacing={2}>
                        <Grid item xs={6} sm={3}>
                          <Box sx={{ textAlign: 'center' }}>
                            <CheckCircle color="success" sx={{ fontSize: { xs: 24, sm: 32 } }} />
                            <Typography variant="h5" color="success.main" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
                              {accepted.length}
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Accepted</Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Cancel color="error" sx={{ fontSize: { xs: 24, sm: 32 } }} />
                            <Typography variant="h5" color="error.main" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
                              {rejected.length}
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Rejected</Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Pending color="warning" sx={{ fontSize: { xs: 24, sm: 32 } }} />
                            <Typography variant="h5" color="warning.main" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
                              {pending.length}
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Pending</Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Comment color="info" sx={{ fontSize: { xs: 24, sm: 32 } }} />
                            <Typography variant="h5" color="info.main" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
                              {commented.length}
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Commented</Typography>
                          </Box>
                        </Grid>
                      </Grid>

                      {accepted.length > 0 && syllabus.editingStatus === 'ready' && syllabus.editedPdf && (
                        <Box sx={{ mt: 2, textAlign: 'center' }}>
                          <Button
                            variant="contained"
                            startIcon={<Download />}
                            onClick={() => downloadPdf(syllabus._id)}
                            fullWidth={false}
                            size="medium"
                            sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' } }}
                          >
                            Download PDF with Changes
                          </Button>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>

                {/* 2. Аналіз відповідності outcomes програми MBA */}
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        🎯 MBA Outcomes Alignment
                      </Typography>
                      
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="h4" color="primary.main">
                          {coverageScore}%
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          learning objectives coverage
                        </Typography>
                      </Box>

                      <Typography variant="subtitle2" gutterBottom>
                        Covered Objectives ({coveredObjectives.length}):
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                        {coveredObjectives.slice(0, 5).map((objective, index) => (
                          <Chip 
                            key={index} 
                            label={objective.substring(0, 25) + '...'} 
                            size="small" 
                            color="success" 
                          />
                        ))}
                        {coveredObjectives.length > 5 && (
                          <Chip label={`+${coveredObjectives.length - 5}`} size="small" />
                        )}
                      </Box>

                      <Typography variant="subtitle2" gutterBottom>
                        Gaps ({gaps.length}):
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {gaps.slice(0, 5).map((gap, index) => (
                          <Chip 
                            key={index} 
                            label={gap.substring(0, 25) + '...'} 
                            size="small" 
                            color="warning" 
                          />
                        ))}
                        {gaps.length > 5 && (
                          <Chip label={`+${gaps.length - 5}`} size="small" />
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                {/* 3. Оцінка практичності та інтерактивності */}
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        💡 Practicality and Interactivity
                      </Typography>

                      <Box sx={{ mb: 2 }}>
                        <Typography variant="body1" gutterBottom>
                          AI Challenger: {challengeCompleted ? 
                            <Chip label="Completed" color="success" size="small" /> : 
                            <Chip label="Not Completed" color="default" size="small" />
                          }
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Number of AI suggestions: {aiSuggestions.length}
                        </Typography>
                      </Box>

                      {aiSuggestions.length > 0 && (
                        <>
                          <Typography variant="subtitle2" gutterBottom>
                            Top AI Suggestions:
                          </Typography>
                          <List dense>
                            {aiSuggestions.slice(0, 3).map((suggestion, index) => (
                              <ListItem key={index} sx={{ px: 0 }}>
                                <ListItemText
                                  primary={suggestion.suggestion?.substring(0, 80) + '...'}
                                  secondary={suggestion.category || 'No category'}
                                  primaryTypographyProps={{ variant: 'body2' }}
                                  secondaryTypographyProps={{ variant: 'caption' }}
                                />
                              </ListItem>
                            ))}
                          </List>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </Grid>

                {/* 4. Пропозиції щодо потенційних покращень */}
                <Grid item xs={12}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        📝 Improvement Suggestions
                      </Typography>
                      
                      {accepted.length > 0 ? (
                        <List>
                          {accepted.slice(0, 5).map((rec, index) => (
                            <React.Fragment key={rec.id || index}>
                              <ListItem sx={{ px: 0 }}>
                                <ListItemText
                                  primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <Chip label={rec.category} size="small" />
                                      <Typography variant="subtitle2">{rec.title}</Typography>
                                    </Box>
                                  }
                                  secondary={rec.description}
                                />
                              </ListItem>
                              {index < Math.min(accepted.length, 5) - 1 && <Divider />}
                            </React.Fragment>
                          ))}
                          {accepted.length > 5 && (
                            <ListItem sx={{ px: 0 }}>
                              <ListItemText
                                primary={
                                  <Typography variant="body2" color="text.secondary">
                                    ... and {accepted.length - 5} more recommendations
                                  </Typography>
                                }
                              />
                            </ListItem>
                          )}
                        </List>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No accepted recommendations
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
};

export default ManagerReports;
