import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Chip, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, LinearProgress,
  Grid, IconButton
} from '@mui/material';
import {
  CheckCircle, Warning, Description, Visibility, Download
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import api from '../services/api';

const PolicyReader = () => {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    try {
      setLoading(true);
      const response = await api.policies.getAll();
      setPolicies(response.data.policies);
    } catch (err) {
      setError('Failed to load documents');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (policyId) => {
    try {
      setAcknowledging(true);
      await api.policies.acknowledge(policyId);
      // Refresh policies to update acknowledgment status
      await loadPolicies();
    } catch (err) {
      setError('Failed to confirm acknowledgment');
      console.error(err);
    } finally {
      setAcknowledging(false);
    }
  };

  const handleDownloadFile = async (policyId) => {
    try {
      const response = await api.policies.downloadFile(policyId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = response.headers['content-disposition']?.split('filename=')[1]?.replace(/"/g, '') || 'file';
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download file');
      console.error(err);
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'ai-policy': return 'AI Policy';
      case 'academic-integrity': return 'Academic Integrity';
      case 'teaching-tips': return 'Teaching Tips';
      default: return type;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'ai-policy': return 'primary';
      case 'academic-integrity': return 'error';
      case 'teaching-tips': return 'success';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <LinearProgress sx={{ width: '100%', maxWidth: 400 }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 4 }}>
        Documents for Review
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {policies.map((policy) => (
          <Grid item xs={12} md={6} lg={4} key={policy._id}>
            <Card sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              opacity: policy.isAcknowledged ? 0.7 : 1
            }}>
              <CardContent sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Typography variant="h6" sx={{ flex: 1, mr: 1 }}>
                    {policy.title}
                  </Typography>
                  <Chip
                    label={getTypeLabel(policy.type)}
                    color={getTypeColor(policy.type)}
                    size="small"
                  />
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {policy.content.substring(0, 200)}...
                </Typography>

                {policy.attachedFile && (
                  <Chip
                    icon={<Description />}
                    label={`File: ${policy.attachedFile.originalName}`}
                    size="small"
                    sx={{ mb: 1 }}
                    variant="outlined"
                  />
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {policy.isAcknowledged ? (
                    <CheckCircle color="success" />
                  ) : (
                    <Warning color="warning" />
                  )}
                  <Typography variant="body2">
                    {policy.isAcknowledged ? 'Acknowledged' : 'Not Acknowledged'}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {policy.isRequired && (
                    <Chip
                      label="Required"
                      color="error"
                      size="small"
                      variant="outlined"
                    />
                  )}
                  {policy.contentType === 'markdown' && (
                    <Chip
                      label="Markdown"
                      size="small"
                      variant="outlined"
                    />
                  )}
                </Box>
              </CardContent>

              <Box sx={{ p: 2, pt: 0 }}>
                {policy.attachedFile && (
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<Download />}
                    onClick={() => handleDownloadFile(policy._id)}
                    sx={{ mb: 1 }}
                  >
                    Download File
                  </Button>
                )}
                
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<Visibility />}
                  onClick={() => setSelectedPolicy(policy)}
                  sx={{ mb: 1 }}
                >
                  View
                </Button>

                {!policy.isAcknowledged && (
                  <Button
                    fullWidth
                    variant="contained"
                    color="success"
                    onClick={() => handleAcknowledge(policy._id)}
                    disabled={acknowledging}
                  >
                    {acknowledging ? 'Confirming...' : 'Confirm Acknowledgment'}
                  </Button>
                )}
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Policy Viewer Dialog */}
      <Dialog
        open={!!selectedPolicy}
        onClose={() => setSelectedPolicy(null)}
        maxWidth="md"
        fullWidth
      >
        {selectedPolicy && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Description />
                {selectedPolicy.title}
                <Chip
                  label={getTypeLabel(selectedPolicy.type)}
                  color={getTypeColor(selectedPolicy.type)}
                  size="small"
                  sx={{ ml: 1 }}
                />
              </Box>
            </DialogTitle>
            <DialogContent>
              <Box sx={{ mt: 2 }}>
                {selectedPolicy.contentType === 'markdown' ? (
                  <Box sx={{ 
                    '& h1': { fontSize: '2rem', mt: 2, mb: 1 },
                    '& h2': { fontSize: '1.5rem', mt: 2, mb: 1 },
                    '& h3': { fontSize: '1.25rem', mt: 2, mb: 1 },
                    '& p': { lineHeight: 1.6, mb: 1 },
                    '& ul, & ol': { pl: 3, mb: 2 },
                    '& code': { 
                      bgcolor: 'grey.100', 
                      p: 0.5, 
                      borderRadius: 1,
                      fontFamily: 'monospace'
                    },
                    '& pre': { 
                      bgcolor: 'grey.100', 
                      p: 2, 
                      borderRadius: 1,
                      overflow: 'auto'
                    }
                  }}>
                    <ReactMarkdown>{selectedPolicy.content}</ReactMarkdown>
                  </Box>
                ) : (
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {selectedPolicy.content}
                  </Typography>
                )}

                {selectedPolicy.attachedFile && (
                  <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Attached File:
                    </Typography>
                    <Button
                      variant="outlined"
                      startIcon={<Download />}
                      onClick={() => handleDownloadFile(selectedPolicy._id)}
                      size="small"
                    >
                      {selectedPolicy.attachedFile.originalName}
                    </Button>
                  </Box>
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedPolicy(null)}>Close</Button>
              {!selectedPolicy.isAcknowledged && (
                <Button
                  variant="contained"
                  color="success"
                  onClick={() => {
                    handleAcknowledge(selectedPolicy._id);
                    setSelectedPolicy(null);
                  }}
                  disabled={acknowledging}
                >
                  Confirm Acknowledgment
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default PolicyReader;
