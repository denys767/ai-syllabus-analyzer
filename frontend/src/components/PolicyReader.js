import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Chip, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, LinearProgress,
  Grid, TextField, MenuItem, Stack, FormControlLabel, Checkbox
} from '@mui/material';
import {
  CheckCircle, Warning, Description, Visibility, Download, UploadFile, Delete
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const emptyUploadForm = {
  title: '',
  type: 'ai-policy',
  content: '',
  isRequired: true,
  file: null,
};

const PolicyReader = () => {
  const { user } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState(emptyUploadForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const isAdmin = user?.role === 'admin';

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

  const resetUploadForm = () => {
    setUploadForm(emptyUploadForm);
    setUploadOpen(false);
  };

  const handleCreatePolicy = async () => {
    const title = uploadForm.title.trim();
    const content = uploadForm.content.trim();
    if (!title) {
      setError('Document title is required');
      return;
    }
    if (!content && !uploadForm.file) {
      setError('Add either document text or an attachment');
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('type', uploadForm.type);
    formData.append('contentType', 'markdown');
    formData.append('isRequired', String(uploadForm.isRequired));
    if (content) formData.append('content', content);
    if (uploadForm.file) formData.append('file', uploadForm.file);

    try {
      setUploading(true);
      setError('');
      await api.policies.create(formData);
      resetUploadForm();
      await loadPolicies();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePolicy = async () => {
    if (!deleteTarget?._id) return;
    try {
      setDeleting(true);
      setError('');
      await api.policies.delete(deleteTarget._id);
      setDeleteTarget(null);
      if (selectedPolicy?._id === deleteTarget._id) {
        setSelectedPolicy(null);
      }
      await loadPolicies();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to delete document');
    } finally {
      setDeleting(false);
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 4 }}>
        <Typography variant="h4">
          Documents for Review
        </Typography>
        {isAdmin && (
          <Button variant="contained" startIcon={<UploadFile />} onClick={() => setUploadOpen(true)}>
            Upload document
          </Button>
        )}
      </Box>

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
                  {(policy.content || '').substring(0, 200)}...
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

                {isAdmin && (
                  <Button
                    fullWidth
                    variant="outlined"
                    color="error"
                    startIcon={<Delete />}
                    onClick={() => setDeleteTarget(policy)}
                    sx={{ mt: 1 }}
                  >
                    Delete
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
              {isAdmin && (
                <Button
                  color="error"
                  startIcon={<Delete />}
                  onClick={() => setDeleteTarget(selectedPolicy)}
                >
                  Delete
                </Button>
              )}
              <Box sx={{ flexGrow: 1 }} />
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

      <Dialog open={uploadOpen} onClose={() => !uploading && resetUploadForm()} maxWidth="sm" fullWidth>
        <DialogTitle>Upload document</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Title"
              value={uploadForm.title}
              onChange={(event) => setUploadForm((form) => ({ ...form, title: event.target.value }))}
              disabled={uploading}
              fullWidth
              required
            />
            <TextField
              select
              label="Document type"
              value={uploadForm.type}
              onChange={(event) => setUploadForm((form) => ({ ...form, type: event.target.value }))}
              disabled={uploading}
              fullWidth
            >
              <MenuItem value="ai-policy">AI Policy</MenuItem>
              <MenuItem value="academic-integrity">Academic Integrity</MenuItem>
              <MenuItem value="teaching-tips">Teaching Tips</MenuItem>
            </TextField>
            <TextField
              label="Summary or markdown text"
              value={uploadForm.content}
              onChange={(event) => setUploadForm((form) => ({ ...form, content: event.target.value }))}
              disabled={uploading}
              fullWidth
              multiline
              minRows={5}
              helperText="Optional when attaching a file."
            />
            <Button variant="outlined" component="label" startIcon={<UploadFile />} disabled={uploading}>
              {uploadForm.file ? uploadForm.file.name : 'Choose file'}
              <input
                hidden
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setUploadForm((form) => ({
                    ...form,
                    file,
                    title: form.title || file?.name?.replace(/\.[^.]+$/, '') || '',
                  }));
                }}
              />
            </Button>
            <FormControlLabel
              control={
                <Checkbox
                  checked={uploadForm.isRequired}
                  onChange={(event) => setUploadForm((form) => ({ ...form, isRequired: event.target.checked }))}
                  disabled={uploading}
                />
              }
              label="Require acknowledgment"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetUploadForm} disabled={uploading}>Cancel</Button>
          <Button variant="contained" onClick={handleCreatePolicy} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete document?</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">
            This will permanently remove "{deleteTarget?.title}" and its attached file.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeletePolicy} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PolicyReader;
