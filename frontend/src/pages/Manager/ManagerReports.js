import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, List,
  ListItem, ListItemText, CircularProgress, Alert, Divider,
  Accordion, AccordionSummary, AccordionDetails, Button,
  FormControl, InputLabel, Select, MenuItem, Stack,
  IconButton, Tooltip
} from '@mui/material';
import {
  CheckCircle, Cancel, Pending, ExpandMore,
  Description, Person, CalendarToday, Download, Delete as DeleteIcon
} from '@mui/icons-material';
import api from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { extractAiSuggestions, getPracticalityScoreData, formatPracticalityScore } from '../../utils/practicality';

const ManagerReports = () => {
  const [syllabi, setSyllabi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedPanel, setExpandedPanel] = useState(false);
  const [downloadingMap, setDownloadingMap] = useState({});
  const [downloadErrors, setDownloadErrors] = useState({});
  const [deletingMap, setDeletingMap] = useState({});
  const [deleteErrors, setDeleteErrors] = useState({});
  const [sortOrder, setSortOrder] = useState('desc');
  const navigate = useNavigate();
  const learningOutcomeChipStyles = {
    maxWidth: '100%',
    alignItems: 'flex-start',
    '& .MuiChip-label': {
      display: 'block',
      whiteSpace: 'normal',
      textAlign: 'left'
    }
  };

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

  const downloadPdf = async (syllabus) => {
    const syllabusId = syllabus._id;
    setDownloadingMap((prev) => ({ ...prev, [syllabusId]: true }));
    setDownloadErrors((prev) => ({ ...prev, [syllabusId]: '' }));

    try {
      const resp = await api.syllabus.downloadEditedPdf(syllabusId);
      const blob = new Blob([
        resp.data
      ], { type: resp.headers['content-type'] || 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const disposition = resp.headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const fallbackName = `${syllabus.title || syllabus.course?.name || 'syllabus'}-diff.pdf`;
      link.download = match ? match[1] : fallbackName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setDownloadErrors((prev) => {
        const next = { ...prev };
        delete next[syllabusId];
        return next;
      });
    } catch (err) {
      console.error('PDF download error:', err);
      const message = err.response?.data?.message || 'Failed to download PDF with changes';
      setDownloadErrors((prev) => ({ ...prev, [syllabusId]: message }));
    } finally {
      setDownloadingMap((prev) => {
        const next = { ...prev };
        delete next[syllabusId];
        return next;
      });
    }
  };

  const handleDeleteSyllabus = async (event, syllabusId) => {
    event.stopPropagation();
    event.preventDefault();

    const confirmed = window.confirm('Delete this syllabus report? This action cannot be undone.');
    if (!confirmed) return;

    setDeletingMap((prev) => ({ ...prev, [syllabusId]: true }));
    setDeleteErrors((prev) => ({ ...prev, [syllabusId]: '' }));

    try {
      await api.syllabus.deleteSyllabus(syllabusId);
      setSyllabi((prev) => prev.filter((item) => item._id !== syllabusId));
      setDeleteErrors((prev) => {
        const next = { ...prev };
        delete next[syllabusId];
        return next;
      });
    } catch (err) {
      console.error('Delete syllabus error:', err);
      const message = err.response?.data?.message || 'Failed to delete syllabus';
      setDeleteErrors((prev) => ({ ...prev, [syllabusId]: message }));
    } finally {
      setDeletingMap((prev) => {
        const next = { ...prev };
        delete next[syllabusId];
        return next;
      });
    }
  };

  const sortedSyllabi = useMemo(() => {
    const list = [...syllabi];
    return list.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
  }, [syllabi, sortOrder]);

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
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.75rem', sm: '2.125rem' }, mb: { xs: 1, sm: 0 } }}>
            Syllabus Reports
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', sm: '0.875rem' } }}>
            Analytical reports for each syllabus after completing the onboarding process
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="sort-by-date-label">Sort by date</InputLabel>
          <Select
            labelId="sort-by-date-label"
            value={sortOrder}
            label="Sort by date"
            onChange={(event) => setSortOrder(event.target.value)}
          >
            <MenuItem value="desc">Newest first</MenuItem>
            <MenuItem value="asc">Oldest first</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {sortedSyllabi.map((syllabus) => {
        const accepted = (syllabus.recommendations || []).filter(r => r.status === 'accepted');
        const rejected = (syllabus.recommendations || []).filter(r => r.status === 'rejected');
        const pending = (syllabus.recommendations || []).filter(r => r.status === 'pending');

        const coveredObjectives = syllabus.analysis?.learningObjectivesAlignment?.alignedObjectives || [];
        const gaps = syllabus.analysis?.learningObjectivesAlignment?.missingObjectives || [];
        const totalObjectives = coveredObjectives.length + gaps.length;
        const coverageScore = totalObjectives > 0 
          ? ((coveredObjectives.length / totalObjectives) * 100).toFixed(1) 
          : 0;

        const challengeCompleted = syllabus.practicalChallenge?.status === 'completed';
        const aiSuggestions = extractAiSuggestions(syllabus);
        const { score: practicalityScore, critique: practicalityCritique } = getPracticalityScoreData(syllabus);

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
                    {new Date(syllabus.createdAt).toLocaleDateString('en-GB')}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip 
                    label={`${accepted.length} accepted`} 
                    color="success" 
                    size="small" 
                  />
                  <Tooltip title="Delete syllabus" arrow>
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        disabled={!!deletingMap[syllabus._id]}
                        onClick={(event) => handleDeleteSyllabus(event, syllabus._id)}
                      >
                        {deletingMap[syllabus._id]
                          ? <CircularProgress size={18} />
                          : <DeleteIcon fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Box>
            </AccordionSummary>

            <AccordionDetails>
              {deleteErrors[syllabus._id] && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {deleteErrors[syllabus._id]}
                </Alert>
              )}
              <Grid container spacing={{ xs: 2, sm: 3 }}>
                {/* 1. Overall Changes Summary */}
                <Grid item xs={12}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                        Overall Changes Summary
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
                      </Grid>

                      {accepted.length > 0 && syllabus.editingStatus === 'ready' && syllabus.editedPdf && (
                        <Box sx={{ mt: 2, textAlign: 'center' }}>
                          <Button
                            variant="contained"
                            startIcon={downloadingMap[syllabus._id] ? <CircularProgress size={18} color="inherit" /> : <Download />}
                            onClick={() => downloadPdf(syllabus)}
                            disabled={Boolean(downloadingMap[syllabus._id])}
                            fullWidth={false}
                            size="medium"
                            sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' } }}
                          >
                            {downloadingMap[syllabus._id] ? 'Preparing PDF...' : 'Download PDF with Changes'}
                          </Button>
                          {downloadErrors[syllabus._id] && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                              {downloadErrors[syllabus._id]}
                            </Alert>
                          )}
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>

                {/* 2. Analysis of MBA program outcomes compliance */}
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        MBA Outcomes Alignment
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
                        {coveredObjectives.map((objective, index) => (
                          <Chip 
                            key={index} 
                            label={objective} 
                            size="small" 
                            color="success" 
                            sx={learningOutcomeChipStyles}
                          />
                        ))}
                      </Box>

                      <Typography variant="subtitle2" gutterBottom>
                        Gaps ({gaps.length}):
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {gaps.map((gap, index) => (
                          <Chip 
                            key={index} 
                            label={gap} 
                            size="small" 
                            color="warning" 
                            sx={learningOutcomeChipStyles}
                          />
                        ))}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                {/* 3. Assessment of practicality and interactivity */}
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Practicality and Interactivity
                      </Typography>

                      <Box sx={{ mb: 2 }}>
                        <Typography variant="body1" gutterBottom>
                          AI Challenger: {challengeCompleted ? 
                            <Chip label="Completed" color="success" size="small" /> : 
                            <Chip label="Not Completed" color="default" size="small" />
                          }
                        </Typography>
                        {challengeCompleted ? (
                          <Box sx={{
                            display: 'flex',
                            flexDirection: { xs: 'column', sm: 'row' },
                            gap: 2,
                            alignItems: { xs: 'flex-start', sm: 'center' }
                          }}>
                            <Box>
                              <Typography variant="h3" color="primary.main" sx={{ lineHeight: 1 }}>
                                {formatPracticalityScore(practicalityScore)}
                                <Typography component="span" variant="subtitle1" sx={{ ml: 0.5 }}>/100</Typography>
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Practicality & interactivity score
                              </Typography>
                            </Box>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="body2" color="text.secondary">
                                {practicalityCritique || 'Score generated after AI challenger completes its response.'}
                              </Typography>
                            </Box>
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Score will appear after the AI challenger response is completed.
                          </Typography>
                        )}
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
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
                                  primary={(() => {
                                    const text = suggestion.title || suggestion.suggestion || 'No description';
                                    return text.length > 80 ? `${text.substring(0, 77)}...` : text;
                                  })()}
                                  secondary={suggestion.category || suggestion.priority || 'No category'}
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

                {/* 4. Suggestions for potential improvements */}
                <Grid item xs={12}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Improvement Suggestions
                      </Typography>
                      
                      {accepted.length > 0 ? (
                        <List>
                          {accepted.map((rec, index) => (
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
                              {index < accepted.length - 1 && <Divider />}
                            </React.Fragment>
                          ))}
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
