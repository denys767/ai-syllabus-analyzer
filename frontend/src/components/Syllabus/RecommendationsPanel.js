import React, { useMemo, useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  Stack,
  TextField,
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
    status === 'accepted' ? 'success' : status === 'rejected' ? 'error' : status === 'commented' ? 'warning' : 'default';
  return <Chip label={status || 'pending'} color={color} size="small" sx={{ textTransform: 'capitalize' }} />;
};

const PriorityChip = ({ priority }) => {
  const color = priority === 'critical' ? 'error' : priority === 'high' ? 'warning' : priority === 'medium' ? 'info' : 'default';
  return <Chip label={`priority: ${priority || 'medium'}`} color={color} size="small" variant="outlined" />;
};

export default function RecommendationsPanel({ syllabusId, recommendations = [], onChanged, syllabus }) {
  const [workingId, setWorkingId] = useState(null);
  const [commentingId, setCommentingId] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pdfReady, setPdfReady] = useState(syllabus?.editingStatus === 'ready' && syllabus?.editedPdf);
  const [pdfMeta, setPdfMeta] = useState(syllabus?.editedPdf || null);
  const [editingStatus, setEditingStatus] = useState(syllabus?.editingStatus || 'idle');
  const [polling, setPolling] = useState(false);
  const [processingComments, setProcessingComments] = useState(new Set()); // Треки рекомендацій, що чекають на AI відповідь

  const grouped = useMemo(() => {
    // Функція для визначення числового значення пріоритету (для сортування)
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

    // Сортуємо рекомендації в кожній групі за пріоритетом (від високого до низького)
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
      
      // Якщо це коментар, додаємо в список очікування AI відповіді
      if (data.status === 'commented') {
        setProcessingComments(prev => new Set([...prev, rec._id || rec.id]));
      }
      
      await api.syllabus.updateRecommendation(syllabusId, rec._id || rec.id, data);
      setCommentingId(null);
      setCommentText('');
      
      // Якщо це коментар, запускаємо polling для отримання AI відповіді
      if (data.status === 'commented') {
        pollForAIResponse(rec._id || rec.id);
      } else {
        onChanged?.();
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update recommendation');
      setProcessingComments(prev => {
        const next = new Set(prev);
        next.delete(rec._id || rec.id);
        return next;
      });
    } finally {
      setWorkingId(null);
    }
  };

  // Polling to get AI response to comment
  const pollForAIResponse = (recId) => {
    let attempts = 0;
    const maxAttempts = 20; // maximum 60 seconds (20 * 3 sec)
    
    const interval = setInterval(async () => {
      attempts++;
      
      try {
        const response = await api.syllabus.getSyllabus(syllabusId);
        const updatedRec = response.data.recommendations?.find(r => (r._id || r.id) === recId);
        
        if (updatedRec?.aiResponse) {
          // AI response received!
          setProcessingComments(prev => {
            const next = new Set(prev);
            next.delete(recId);
            return next;
          });
          clearInterval(interval);
          onChanged?.();
        } else if (attempts >= maxAttempts) {
          // Timeout - stop trying
          setProcessingComments(prev => {
            const next = new Set(prev);
            next.delete(recId);
            return next;
          });
          clearInterval(interval);
          setError('AI response is delayed. Try refreshing the page later.');
        }
      } catch (err) {
        console.error('Polling AI response error:', err);
        setProcessingComments(prev => {
          const next = new Set(prev);
          next.delete(recId);
          return next;
        });
        clearInterval(interval);
      }
    }, 3000);
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
          
          // Показуємо повідомлення про успіх
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
                  💡 Запропонований текст:
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  {rec.suggestedText}
                </Typography>
              </Paper>
            )}

            {rec.instructorComment && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Your comment: {rec.instructorComment}
              </Typography>
            )}
            
            {/* AI response waiting indicator */}
            {processingComments.has(rec._id || rec.id) && !rec.aiResponse && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="caption" color="info.main">
                  AI is preparing a response to your comment...
                </Typography>
              </Stack>
            )}
            
            {rec.aiResponse && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                AI Response: {rec.aiResponse}
              </Typography>
            )}

            <Divider sx={{ my: 1.5 }} />

            {commentingId === (rec._id || rec.id) ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Comment"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <Button
                  variant="contained"
                  color="primary"
                  disabled={workingId === (rec._id || rec.id) || !commentText.trim()}
                  onClick={() => update(rec, { status: 'commented', comment: commentText.trim() })}
                >
                  Save Comment
                </Button>
                <Button variant="text" onClick={() => { setCommentingId(null); setCommentText(''); }}>
                  Cancel
                </Button>
              </Stack>
            ) : (
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
                  color="secondary"
                  disabled={workingId === (rec._id || rec.id)}
                  onClick={() => { setCommentingId(rec._id || rec.id); setCommentText(rec.instructorComment || ''); }}
                >
                  Comment
                </Button>
              </Stack>
            )}
          </Paper>
        ))}
      </Stack>
      {/* AI Challenger removed in v2.0.0 refactoring */}
    </Box>
  );
}
