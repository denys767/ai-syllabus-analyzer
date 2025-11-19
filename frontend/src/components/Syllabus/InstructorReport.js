import React from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, List,
  ListItem, ListItemText, Divider
} from '@mui/material';
import {
  CheckCircle, Cancel, Pending, Comment
} from '@mui/icons-material';
import {
  extractAiSuggestions,
  getPracticalityScoreData,
  formatPracticalityScore
} from '../../utils/practicality';

const InstructorReport = ({ syllabus }) => {
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

  const learningOutcomeChipStyles = {
    maxWidth: '100%',
    alignItems: 'flex-start',
    '& .MuiChip-label': {
      display: 'block',
      whiteSpace: 'normal',
      textAlign: 'left'
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
              </Grid>
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
                  learning outcomes coverage
                </Typography>
              </Box>

              <Typography variant="subtitle2" gutterBottom>
                Covered Outcomes ({coveredObjectives.length}):
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
                Outcome gaps ({gaps.length}):
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
