import React, { useMemo, useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  Stack,
  Paper,
  Divider,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material';
import api from '../../services/api';
// import AIChallenger from './AIChallenger'; // Removed in v2.0.0 refactoring

const StatusChip = ({ status }) => {
  const color =
    status === 'accepted' ? 'success' : status === 'rejected' ? 'error' : 'default';
  return <Chip label={status || 'pending'} color={color} size="small" sx={{ textTransform: 'capitalize' }} />;
};

const PriorityChip = ({ priority }) => {
  const color = priority === 'critical' ? 'error' : priority === 'high' ? 'warning' : priority === 'medium' ? 'info' : 'default';
  return <Chip label={`priority: ${priority || 'medium'}`} color={color} size="small" variant="outlined" />;
};

export default function RecommendationsPanel({ syllabusId, recommendations = [], onChanged, syllabus }) {
  const [workingId, setWorkingId] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pdfReady, setPdfReady] = useState(syllabus?.editingStatus === 'ready' && syllabus?.editedPdf);
  const [pdfMeta, setPdfMeta] = useState(syllabus?.editedPdf || null);
  const [editingStatus, setEditingStatus] = useState(syllabus?.editingStatus || 'idle');
  const [polling, setPolling] = useState(false);

  const grouped = useMemo(() => {
    // Function to determine numeric priority value (for sorting)
    const getPriorityWeight = (priority) => {
      const weights = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
      return weights[priority] || 0;
    };

    const groups = {
      'Template Compliance': [],
      'Learning Objectives Alignment': [],
      'Plagiarism Check': [],
      'Student Clusters Integration': [],
      'Practicality': [],
      'Other': []
    };
    recommendations.forEach(r => {
      // New categories from backend v2.0.0
      if (r.category === 'template-compliance' || r.category === 'structure') {
        groups['Template Compliance'].push(r);
      } 
      else if (r.category === 'learning-objectives' || r.category === 'objectives') {
        groups['Learning Objectives Alignment'].push(r);
      }
      else if (r.category === 'plagiarism') {
        groups['Plagiarism Check'].push(r);
      }
      else if (r.category === 'student-clusters' || r.category === 'cases') {
        groups['Student Clusters Integration'].push(r);
      }
      else if (r.category === 'practicality') {
        groups['Practicality'].push(r);
      }
      else if (r.category === 'content-quality' || r.category === 'content' || 
               r.category === 'methods' || r.category === 'assessment' || 
               r.category === 'policy' || r.category === 'other') {
        groups['Other'].push(r);
      }
      else {
        // Fallback for unknown categories
        groups['Other'].push(r);
      }
    });

    // Sort recommendations in each group by priority (from high to low)
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => getPriorityWeight(b.priority) - getPriorityWeight(a.priority));
    });

    return groups;
  }, [recommendations]);

  const tabs = Object.keys(grouped);

  const update = async (rec, data) => {
    try {
      setWorkingId(rec._id || rec.id);
      setError('');
      
      await api.syllabus.updateRecommendation(syllabusId, rec._id || rec.id, data);
      onChanged?.();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update recommendation');
    } finally {
      setWorkingId(null);
    }
  };

  const allAccepted = recommendations.some(r => r.status === 'accepted');

  useEffect(() => {
    setEditingStatus(syllabus?.editingStatus || 'idle');
    setPdfMeta(syllabus?.editedPdf || null);
    setPdfReady(syllabus?.editingStatus === 'ready' && !!syllabus?.editedPdf);
    setPolling(syllabus?.editingStatus === 'processing');
  }, [syllabus]);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await api.syllabus.getEditingStatus(syllabus._id);
        setEditingStatus(data.status);
        
        if (data.editedPdf && data.status === 'ready') {
          setPdfMeta(data.editedPdf);
          setPdfReady(true);
          setPolling(false);
          setGenerating(false);
          
          // Show success message
          setError('');
          onChanged?.();
        }
        
        if (data.status === 'error') {
          setError(data.error || 'LLM could not generate changes. Please try again.');
          setPolling(false);
          setGenerating(false);
        }
      } catch (err) {
        console.error('Polling editing status error:', err);
        setError('Failed to update editing status. Check your connection.');
        setPolling(false);
        setGenerating(false);
      }
    }, 3000); // Check every 3 seconds
    return () => clearInterval(interval);
  }, [polling, syllabus?._id, onChanged]);

  const requestPdfGeneration = async () => {
    try {
      setGenerating(true);
      setError('');
      await api.syllabus.requestDiffPdf(syllabus._id);
      setEditingStatus('processing');
      setPdfReady(false);
      setPolling(true);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to start PDF generation';
      setError(msg);
    } finally {
      setGenerating(false);
      setEditing(false);
    }
  };

  const downloadPdf = async () => {
    try {
      setGenerating(true);
      const resp = await api.syllabus.downloadEditedPdf(syllabus._id);
      const url = window.URL.createObjectURL(new Blob([resp.data], { type: resp.headers['content-type'] || 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      const disposition = resp.headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match ? match[1] : (pdfMeta?.filename || `${(syllabus.title || 'syllabus')}-diff.pdf`);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download PDF with changes');
    } finally {
      setGenerating(false);
    }
  };
  return (
    <Box sx={{
      // Make the panel feel wider by relaxing max width constraints inside the Paper
      '& .rec-card': { width: '100%' }
    }}>
      <Typography variant="h6" gutterBottom>
        AI Recommendations
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Accept or reject proposed syllabus changes. After completion, an updated file will be generated.
      </Typography>
      <Tabs value={tab} onChange={(e,v)=> setTab(v)} sx={{ mb:2 }} variant="scrollable" scrollButtons allowScrollButtonsMobile>
        {tabs.map(label => <Tab key={label} label={`${label} (${grouped[label].length})`} />)}
      </Tabs>
      <Stack direction="row" spacing={1} sx={{ mb:2 }}>
        <Button
          size="small"
          variant={editing ? 'contained' : 'outlined'}
          disabled={!allAccepted || editingStatus === 'processing'}
          onClick={() => setEditing(v => !v)}
        >
          Edit Syllabus with AI
        </Button>
        {editing && (
          <Button
            size="small"
            variant="contained"
            color="secondary"
            onClick={requestPdfGeneration}
            disabled={generating}
            startIcon={generating ? <CircularProgress size={14} /> : null}
          >
            {generating ? 'Sending...' : 'Submit for Processing' }
          </Button>
        )}
        {!editing && pdfReady && (
          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={downloadPdf}
            disabled={generating}
            startIcon={generating ? <CircularProgress size={14} /> : null}
          >
            {generating ? 'Preparing file...' : 'Download PDF with Changes'}
          </Button>
        )}
        {editingStatus === 'processing' && (
          <Chip 
            color="info" 
            label="LLM processing... (may take up to 2 min)" 
            size="small"
            icon={<CircularProgress size={14} />}
          />
        )}
        {editingStatus === 'ready' && pdfReady && (
          <Chip 
            color="success" 
            label="✓ PDF ready!" 
            size="small"
          />
        )}
        {editingStatus === 'error' && (
          <Chip 
            color="error" 
            label="Processing error" 
            size="small"
            variant="outlined"
          />
        )}
        {pdfMeta && pdfReady && (
          <Chip color="default" size="small" label={`Updated: ${new Date(pdfMeta.generatedAt).toLocaleString('en-US')}`} />
        )}
      </Stack>
      {error && (
        <Typography color="error" variant="caption" sx={{ display: 'block', mb: 1 }}>
          {error}
        </Typography>
      )}

      {(!recommendations || recommendations.length === 0) && (
        <Typography variant="body2" color="text.secondary">No recommendations yet.</Typography>
      )}

      <Stack spacing={2} sx={{
        // On wider screens, ensure cards expand instead of looking like a thin column
        '@media (min-width: 1200px)': {
          '& > *': { width: '100%' }
        }
      }}>
        {(grouped[tabs[tab]]||[]).map((rec, idx) => (
          <Paper 
            key={rec._id || rec.id || idx} 
            className="rec-card" 
            sx={{ 
              p: 2,
              border: '1px solid',
              borderColor: rec.priority === 'critical' ? 'error.main' : 
                           rec.priority === 'high' ? 'warning.main' : 
                           rec.priority === 'medium' ? 'info.main' : 'divider',
              borderLeft: '4px solid',
              borderLeftColor: rec.priority === 'critical' ? 'error.main' : 
                               rec.priority === 'high' ? 'warning.main' : 
                               rec.priority === 'medium' ? 'info.main' : 'primary.main'
            }} 
            variant="outlined"
          >
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap">
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip 
                  label={rec.category || 'content'} 
                  size="small"
                  color={rec.category === 'practicality' ? 'secondary' : 'default'}
                  variant={rec.category === 'practicality' ? 'filled' : 'outlined'}
                />
                <PriorityChip priority={rec.priority} />
                <StatusChip status={rec.status} />
              </Stack>
              <Typography variant="subtitle1" sx={{ flexGrow: 1, textAlign: { xs: 'left', sm: 'right' } }}>
                {rec.title || 'Recommendation'}
              </Typography>
            </Stack>
            {rec.description && (
              <Typography variant="body2" sx={{ mt: 1 }}>{rec.description}</Typography>
            )}
            
            {rec.suggestedText && (
              <Paper sx={{ mt: 1, p: 1.5, bgcolor: 'action.hover' }} variant="outlined">
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
                  Suggested text:
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  {rec.suggestedText}
                </Typography>
              </Paper>
            )}

            <Divider sx={{ my: 1.5 }} />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="contained"
                color="success"
                disabled={workingId === (rec._id || rec.id) || rec.status === 'accepted'}
                onClick={() => update(rec, { status: 'accepted' })}
              >
                Accept
              </Button>
              <Button
                variant="outlined"
                color="error"
                disabled={workingId === (rec._id || rec.id) || rec.status === 'rejected'}
                onClick={() => update(rec, { status: 'rejected' })}
              >
                Reject
              </Button>
              <Button
                variant="text"
                disabled={workingId === (rec._id || rec.id) || rec.status === 'pending'}
                onClick={() => update(rec, { status: 'pending' })}
              >
                Reset to pending
              </Button>
            </Stack>
          </Paper>
        ))}
      </Stack>
      {/* AI Challenger removed in v2.0.0 refactoring */}
    </Box>
  );
}
