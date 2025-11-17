import React from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, List,
  ListItem, ListItemText, Divider, Button
} from '@mui/material';
import {
  CheckCircle, Cancel, Pending, Comment,
  Description, Download
} from '@mui/icons-material';
import api from '../../services/api';

const InstructorReport = ({ syllabus }) => {
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
  const learningOutcomeChipStyles = {
    maxWidth: '100%',
    alignItems: 'flex-start',
    '& .MuiChip-label': {
      display: 'block',
      whiteSpace: 'normal',
      textAlign: 'left'
    }
  };

  const downloadPdf = async () => {
    try {
      await api.syllabus.downloadEditedPdf(syllabus._id);
    } catch (err) {
      console.error('Error downloading PDF:', err);
    }
  };

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Syllabus Analysis Report
      </Typography>

      <Grid container spacing={3}>
        {/* 1. Overall Changes Summary */}
        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Overall Changes Summary
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Changes made during syllabus editing based on accepted recommendations
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <CheckCircle color="success" sx={{ fontSize: 32 }} />
                    <Typography variant="h5" color="success.main">
                      {accepted.length}
                    </Typography>
                    <Typography variant="body2">Accepted</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Cancel color="error" sx={{ fontSize: 32 }} />
                    <Typography variant="h5" color="error.main">
                      {rejected.length}
                    </Typography>
                    <Typography variant="body2">Rejected</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Pending color="warning" sx={{ fontSize: 32 }} />
                    <Typography variant="h5" color="warning.main">
                      {pending.length}
                    </Typography>
                    <Typography variant="body2">Pending</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Comment color="info" sx={{ fontSize: 32 }} />
                    <Typography variant="h5" color="info.main">
                      {commented.length}
                    </Typography>
                    <Typography variant="body2">Commented</Typography>
                  </Box>
                </Grid>
              </Grid>

              {/* Removed duplicate download button (kept single source in RecommendationsPanel) */}
            </CardContent>
          </Card>
        </Grid>

        {/* 2. MBA Outcomes Alignment */}
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

        {/* 3. Practicality and Interactivity Assessment */}
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

        {/* 4. Improvement Suggestions */}
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
    </Box>
  );
};

export default InstructorReport;
