import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  CircularProgress,
  Typography,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
} from '@mui/material';
import { Add, Close } from '@mui/icons-material';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import EmptyState from '../components/Workspace/EmptyState';
import IssuesPanel from '../components/Workspace/IssuesPanel';
import MessageBubble, { MarkdownText } from '../components/Workspace/MessageBubble';
import ChatInput from '../components/Workspace/ChatInput';

// Per-user key so a different user signed in on the same browser cannot
// see the previous user's syllabus tabs.
const OPEN_TABS_KEY_PREFIX = 'pt.openTabs.v1.';
const LAST_CHAT_KEY_PREFIX = 'pt.lastChat.v1.';
function tabsKeyFor(userId) {
  return `${OPEN_TABS_KEY_PREFIX}${userId || 'anon'}`;
}
function lastChatKeyFor(userId) {
  return `${LAST_CHAT_KEY_PREFIX}${userId || 'anon'}`;
}
function readOpenTabs(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}
function writeOpenTabs(key, tabs) {
  localStorage.setItem(key, JSON.stringify(tabs));
}

const REV_DEL_OPEN = '[[KSE_DEL]]';
const REV_DEL_CLOSE = '[[/KSE_DEL]]';
const REV_ADD_OPEN = '[[KSE_ADD]]';
const REV_ADD_CLOSE = '[[/KSE_ADD]]';

function splitRevisionMarkup(markup) {
  const source = String(markup || '');
  const parts = [];
  let mode = 'same';
  let buffer = '';
  for (let i = 0; i < source.length;) {
    const nextMarker = [REV_DEL_OPEN, REV_DEL_CLOSE, REV_ADD_OPEN, REV_ADD_CLOSE]
      .find((marker) => source.startsWith(marker, i));
    if (nextMarker) {
      if (buffer) parts.push({ mode, text: buffer });
      buffer = '';
      if (nextMarker === REV_DEL_OPEN) mode = 'del';
      if (nextMarker === REV_ADD_OPEN) mode = 'add';
      if (nextMarker === REV_DEL_CLOSE || nextMarker === REV_ADD_CLOSE) mode = 'same';
      i += nextMarker.length;
    } else {
      buffer += source[i];
      i += 1;
    }
  }
  if (buffer) parts.push({ mode, text: buffer });
  return parts;
}

const RevisionPreview = ({ markup }) => (
  <Box
    component="pre"
    sx={{
      m: 0,
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      fontFamily: 'inherit',
      fontSize: '0.875rem',
      lineHeight: 1.6,
    }}
  >
    {splitRevisionMarkup(markup).map((part, index) => (
      <Box
        key={`${part.mode}-${index}`}
        component="span"
        sx={{
          bgcolor: part.mode === 'add' ? 'success.light' : part.mode === 'del' ? 'error.light' : 'transparent',
          color: part.mode === 'del' ? 'error.dark' : 'inherit',
          textDecoration: part.mode === 'del' ? 'line-through' : 'none',
          px: part.mode === 'same' ? 0 : 0.25,
          borderRadius: part.mode === 'same' ? 0 : 0.5,
        }}
      >
        {part.text}
      </Box>
    ))}
  </Box>
);

const ProfessorTutorWorkspace = () => {
  const { syllabusId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tabsKey = useMemo(() => tabsKeyFor(user?.id || user?._id), [user]);
  const lastChatKey = useMemo(() => lastChatKeyFor(user?.id || user?._id), [user]);
  const [openTabs, setOpenTabs] = useState(() => readOpenTabs(tabsKey));
  const [syllabus, setSyllabus] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [issuePreview, setIssuePreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const pollRef = useRef(null);
  const threadEndRef = useRef(null);
  const lastTabsKeyRef = useRef(tabsKey);

  // When the active user changes, rehydrate tabs from their key before persisting,
  // otherwise we'd write the previous user's tabs into the new user's slot.
  useEffect(() => {
    if (lastTabsKeyRef.current !== tabsKey) {
      lastTabsKeyRef.current = tabsKey;
      setOpenTabs(readOpenTabs(tabsKey));
      return;
    }
    writeOpenTabs(tabsKey, openTabs);
  }, [tabsKey, openTabs]);

  useEffect(() => {
    if (syllabusId) {
      localStorage.setItem(lastChatKey, syllabusId);
    }
  }, [lastChatKey, syllabusId]);

  const closeTab = useCallback((id) => {
    setOpenTabs((tabs) => {
      const next = tabs.filter((t) => t.id !== id);
      if (id === syllabusId) {
        const fallback = next[0]?.id;
        navigate(fallback ? `/workspace/${fallback}` : '/workspace');
      }
      return next;
    });
  }, [syllabusId, navigate]);

  const ensureTab = useCallback((id, title) => {
    setOpenTabs((tabs) => {
      if (tabs.some((t) => t.id === id)) {
        return tabs.map((t) => (t.id === id && title ? { ...t, title } : t));
      }
      return [...tabs, { id, title: title || 'Syllabus' }];
    });
  }, []);

  const refresh = useCallback(async (id) => {
    if (!id) return;
    try {
      const [{ data: syl }, { data: chat }] = await Promise.all([
        api.syllabus.getSyllabus(id),
        api.chat.get(id),
      ]);
      setSyllabus(syl);
      setConversation(chat?.conversation || null);
      setMessages(chat?.messages || []);
      ensureTab(id, syl.course?.name || syl.title);
      // Auto-bootstrap once analysis is done and there's no conversation yet
      if (syl.status === 'in_progress' && !chat?.conversation) {
        const { data: started } = await api.chat.start(id);
        setConversation(started?.conversation || null);
        setMessages(started?.messages || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load syllabus');
    }
  }, [ensureTab]);

  // Load when route param changes
  useEffect(() => {
    if (!syllabusId) {
      setSyllabus(null);
      setConversation(null);
      setMessages([]);
      return;
    }
    setError('');
    setLoading(true);
    refresh(syllabusId).finally(() => setLoading(false));
  }, [syllabusId, refresh]);

  // Poll status while analyzing
  useEffect(() => {
    clearInterval(pollRef.current);
    if (!syllabus || syllabus.status !== 'analyzing') return;
    pollRef.current = setInterval(() => refresh(syllabusId), 5000);
    return () => clearInterval(pollRef.current);
  }, [syllabus, syllabusId, refresh]);

  // Auto-scroll on new messages
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleUploaded = (id) => {
    ensureTab(id, '');
    navigate(`/workspace/${id}`);
  };

  const handleConfirm = async (issueId, selection = null) => {
    setBusy(true);
    setError('');
    try {
      const payload = selection ? { issueId, selection } : { issueId };
      const { data } = await api.chat.confirm(syllabusId, payload);
      setConversation(data?.conversation || null);
      setMessages(data?.messages || []);
      // Refresh syllabus.recommendations for the IssuesPanel
      const { data: syl } = await api.syllabus.getSyllabus(syllabusId);
      setSyllabus(syl);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (issueId) => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.chat.cancel(syllabusId, { issueId });
      setConversation(data?.conversation || null);
      setMessages(data?.messages || []);
      const { data: syl } = await api.syllabus.getSyllabus(syllabusId);
      setSyllabus(syl);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async (text) => {
    setError('');
    try {
      const { data } = await api.chat.sendMessage(syllabusId, { text });
      setConversation(data?.conversation || null);
      setMessages(data?.messages || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Send failed');
    }
  };

  const handlePreview = async () => {
    setBusy(true);
    setError('');
    try {
      const { data: blob } = await api.chat.preview(syllabusId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError('Preview generation failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleIssuePreview = async (issueId, selection = null) => {
    setPreviewLoading(true);
    setError('');
    try {
      const { data } = await api.chat.issuePreview(syllabusId, issueId, selection);
      setIssuePreview(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Issue preview failed. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.chat.submit(syllabusId);
      setConversation(data?.conversation || null);
      setMessages(data?.messages || []);
      const { data: syl } = await api.syllabus.getSyllabus(syllabusId);
      setSyllabus(syl);
    } catch (err) {
      setError(err.response?.data?.message || 'Submission failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const issues = useMemo(() => syllabus?.recommendations || [], [syllabus?.recommendations]);
  const issueById = useMemo(() => {
    const map = new Map();
    issues.forEach((issue) => map.set(issue.id, issue));
    return map;
  }, [issues]);
  const currentIssueId = conversation?.currentIssueId;

  const tabHeader = useMemo(() => (
    <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', px: 1, bgcolor: 'background.paper' }}>
      <Tabs
        value={syllabusId || false}
        onChange={(_e, value) => navigate(`/workspace/${value}`)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ flexGrow: 1, minHeight: 40 }}
      >
        {openTabs.map((t) => (
          <Tab
            key={t.id}
            value={t.id}
            sx={{ minHeight: 40, textTransform: 'none', pr: 1 }}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title || 'Untitled'}
                </Box>
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                  sx={{ p: 0.25 }}
                >
                  <Close sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            }
          />
        ))}
      </Tabs>
      <Tooltip title="New syllabus">
        <IconButton size="small" onClick={() => navigate('/workspace')}>
          <Add fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  ), [openTabs, syllabusId, navigate, closeTab]);

  // No syllabus selected → empty-state with dropzone
  if (!syllabusId) {
    return (
      <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
        {openTabs.length > 0 && tabHeader}
        <Box sx={{ flexGrow: 1, overflow: 'auto', bgcolor: 'background.default' }}>
          <EmptyState onUploaded={handleUploaded} />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      {tabHeader}
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ borderRadius: 0 }}>{error}</Alert>}
      <Box sx={{ flexGrow: 1, display: 'flex', minHeight: 0 }}>
        <IssuesPanel issues={issues} readiness={conversation?.readiness} currentIssueId={currentIssueId} />
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3, bgcolor: 'background.default' }}>
            {loading && !messages.length ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 6, gap: 2 }}>
                <CircularProgress />
                <Typography variant="body2" color="text.secondary">Loading conversation…</Typography>
              </Box>
            ) : syllabus?.status === 'analyzing' ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 6, gap: 2 }}>
                <CircularProgress />
                <Typography variant="body2" color="text.secondary">Reviewing your syllabus…</Typography>
              </Box>
            ) : (
              <>
                {messages.map((m) => (
                  <MessageBubble
                    key={m._id}
                    message={m}
                    issue={m.relatedIssueId ? issueById.get(m.relatedIssueId) : null}
                    currentIssueId={currentIssueId}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                    onPreview={handlePreview}
                    onIssuePreview={handleIssuePreview}
                    onSubmit={handleSubmit}
                    busy={busy || previewLoading}
                  />
                ))}
                <div ref={threadEndRef} />
              </>
            )}
          </Box>
          <ChatInput onSend={handleSend} disabled={syllabus?.status === 'analyzing'} />
        </Box>
      </Box>
      <Dialog open={!!issuePreview} onClose={() => setIssuePreview(null)} fullWidth maxWidth="lg">
        <DialogTitle>{issuePreview?.title || 'Issue preview'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Tracked changes</Typography>
              <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.default', maxHeight: 360, overflow: 'auto' }}>
                <RevisionPreview markup={issuePreview?.revisionMarkup || issuePreview?.previewText || ''} />
              </Box>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Clean preview</Typography>
              <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', maxHeight: 360, overflow: 'auto' }}>
                <MarkdownText>{issuePreview?.previewText || ''}</MarkdownText>
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIssuePreview(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProfessorTutorWorkspace;
