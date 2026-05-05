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
} from '@mui/material';
import { Add, Close } from '@mui/icons-material';
import api from '../services/api';
import EmptyState from '../components/Workspace/EmptyState';
import IssuesPanel from '../components/Workspace/IssuesPanel';
import MessageBubble from '../components/Workspace/MessageBubble';
import ChatInput from '../components/Workspace/ChatInput';

const OPEN_TABS_KEY = 'pt.openTabs.v1';

function readOpenTabs() {
  try {
    return JSON.parse(localStorage.getItem(OPEN_TABS_KEY)) || [];
  } catch {
    return [];
  }
}
function writeOpenTabs(tabs) {
  localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(tabs));
}

const ProfessorTutorWorkspace = () => {
  const { syllabusId } = useParams();
  const navigate = useNavigate();
  const [openTabs, setOpenTabs] = useState(readOpenTabs);
  const [syllabus, setSyllabus] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);
  const threadEndRef = useRef(null);

  // Persist tabs whenever they change
  useEffect(() => { writeOpenTabs(openTabs); }, [openTabs]);

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

  const handleConfirm = async (issueId) => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.chat.confirm(syllabusId, { issueId });
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

  const issues = syllabus?.recommendations || [];
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
                    currentIssueId={currentIssueId}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                    onPreview={handlePreview}
                    onSubmit={handleSubmit}
                    busy={busy}
                  />
                ))}
                <div ref={threadEndRef} />
              </>
            )}
          </Box>
          <ChatInput onSend={handleSend} disabled={syllabus?.status === 'analyzing'} />
        </Box>
      </Box>
    </Box>
  );
};

export default ProfessorTutorWorkspace;
