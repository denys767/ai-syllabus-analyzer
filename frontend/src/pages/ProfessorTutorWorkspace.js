import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  CircularProgress,
  Drawer,
  IconButton,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { ListAlt } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../contexts/AuthContext';
import useWorkspace from '../hooks/useWorkspace';
import useWorkspaceTabs from '../hooks/useWorkspaceTabs';
import EmptyState from '../components/Workspace/EmptyState';
import ChatInput from '../components/Workspace/ChatInput';
import MessageItem from '../components/Workspace/messages/MessageItem';
import PendingReply from '../components/Workspace/messages/PendingReply';
import Bubble from '../components/Workspace/messages/Bubble';
import WorkspaceTabs from '../components/Workspace/WorkspaceTabs';
import WorkspaceSidePanel from '../components/Workspace/WorkspaceSidePanel';
import WorkspaceBanners from '../components/Workspace/WorkspaceBanners';
import AnalysisProgress from '../components/Workspace/AnalysisProgress';
import DocumentPreviewDialog from '../components/Workspace/DocumentPreviewDialog';
import SubmitDialog from '../components/Workspace/SubmitDialog';

const HIGHLIGHT_MS = 1600;

const Centered = ({ children }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 6, gap: 2 }}>{children}</Box>
);

const ProfessorTutorWorkspace = () => {
  const { syllabusId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const { openTabs, closeTab, ensureTab, dropMissing } = useWorkspaceTabs(user, syllabusId);
  const ws = useWorkspace(syllabusId, {
    onNotFound: dropMissing,
    onLoaded: (syl) => { if (syl) ensureTab(syl.id || syllabusId, syl.title); },
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const threadRef = useRef(null);
  const highlightTimer = useRef(null);

  const { messages, suggestions, syllabus } = ws;
  const status = syllabus?.status;

  useEffect(() => () => clearTimeout(highlightTimer.current), []);

  useEffect(() => {
    // Прокручуємо лише стрічку чату: scrollIntoView зсував би всю сторінку під app bar
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, ws.pendingText]);

  const suggestionById = useMemo(() => new Map(suggestions.map((s) => [s.id, s])), [suggestions]);
  // Повна картка — лише на останньому повідомленні про пропозицію; раніші стають посиланнями.
  const latestMessageForSuggestion = useMemo(() => {
    const map = new Map();
    messages.forEach((m) => { if (m.kind === 'suggestion') map.set(m.relatedSuggestionId, m._id); });
    return map;
  }, [messages]);

  const scrollToSuggestion = useCallback((id) => {
    setPanelOpen(false);
    const el = document.getElementById(`suggestion-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedId(id);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
  }, []);

  const handleUploaded = (id) => {
    ensureTab(id, '');
    navigate(`/workspace/${id}`);
  };

  const confirmSubmit = async () => {
    await ws.submit(); // помилка потрапляє в ws.error і показується над чатом
    setSubmitOpen(false);
  };

  const tabs = (
    <WorkspaceTabs
      tabs={openTabs}
      activeId={syllabusId}
      onSelect={(id) => navigate(`/workspace/${id}`)}
      onClose={closeTab}
      onNew={() => navigate('/workspace')}
      extra={syllabusId && !wide ? (
        <Tooltip title="Готовність і файли">
          <IconButton size="small" onClick={() => setPanelOpen(true)}><ListAlt fontSize="small" /></IconButton>
        </Tooltip>
      ) : null}
    />
  );

  if (!syllabusId) {
    return (
      <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {openTabs.length > 0 && tabs}
        <Box sx={{ flexGrow: 1, overflow: 'auto', bgcolor: 'background.default' }}>
          <EmptyState onUploaded={handleUploaded} />
        </Box>
      </Box>
    );
  }

  const analyzing = status === 'analyzing';
  const failed = status === 'error';
  const ready = ws.loaded && !analyzing && !failed;
  const chatDisabled = !ready || ws.readOnly;

  const sidePanel = (
    <WorkspaceSidePanel
      readiness={ws.readiness}
      suggestions={suggestions}
      outputs={ws.outputs}
      filesEnabled={ready && !ws.legacy}
      downloading={ws.downloading}
      canSubmit={ws.canSubmit}
      submitted={ws.submitted}
      readOnly={ws.readOnly}
      busy={ws.busy}
      pendingCount={ws.pendingCount}
      onSelectSuggestion={scrollToSuggestion}
      onDownload={ws.downloadOutput}
      onPreviewDocument={ws.openDocumentPreview}
      onSubmit={() => setSubmitOpen(true)}
    />
  );

  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {tabs}
      {ws.error && <Alert severity="error" onClose={ws.clearError} sx={{ borderRadius: 0 }}>{ws.error}</Alert>}
      <WorkspaceBanners syllabus={syllabus} onUploadAgain={() => navigate('/workspace')} />
      <Box sx={{ flexGrow: 1, display: 'flex', minHeight: 0 }}>
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Box ref={threadRef} sx={{ flexGrow: 1, overflow: 'auto', p: { xs: 1.5, md: 3 }, bgcolor: 'background.default' }}>
            {ws.loading && !ws.loaded ? (
              <Centered>
                <CircularProgress />
                <Typography variant="body2" color="text.secondary">Завантаження розмови…</Typography>
              </Centered>
            ) : analyzing || failed ? (
              <AnalysisProgress
                stage={ws.analysis.stage}
                error={ws.analysis.error}
                failed={failed}
                timedOut={analyzing && ws.analysis.timedOut}
                busy={ws.busy}
                onRetry={ws.reanalyze}
              />
            ) : ws.loaded ? (
              <>
                {!messages.length && !suggestions.length && (
                  <Alert severity="info">
                    {ws.legacy ? 'У цьому силабусі немає збережених повідомлень.' : 'Пропозицій немає: силабус відповідає перевіреним вимогам.'}
                  </Alert>
                )}
                {messages.map((m) => (
                  <MessageItem
                    key={m._id}
                    message={m}
                    suggestion={m.kind === 'suggestion' ? suggestionById.get(m.relatedSuggestionId) : null}
                    isLatestForSuggestion={latestMessageForSuggestion.get(m.relatedSuggestionId) === m._id}
                    actions={ws.actions}
                    busy={ws.busy}
                    readOnly={ws.readOnly}
                    highlightedId={highlightedId}
                    pendingCount={ws.pendingCount}
                    submitted={ws.submitted}
                    onPreviewDocument={ws.openDocumentPreview}
                    onSubmit={() => setSubmitOpen(true)}
                    onSelectSuggestion={scrollToSuggestion}
                  />
                ))}
                {ws.pendingText && (
                  <>
                    <Bubble role="user">
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{ws.pendingText}</Typography>
                    </Bubble>
                    <PendingReply />
                  </>
                )}
                              </>
            ) : null}
          </Box>
          <ChatInput onSend={ws.sendMessage} disabled={chatDisabled} />
        </Box>
        {wide && (
          <Box sx={{ borderLeft: '1px solid', borderColor: 'divider', flexShrink: 0 }}>{sidePanel}</Box>
        )}
      </Box>
      {!wide && (
        <Drawer anchor="right" open={panelOpen} onClose={() => setPanelOpen(false)}>
          {sidePanel}
        </Drawer>
      )}
      <DocumentPreviewDialog
        open={ws.docPreview.open}
        loading={ws.docPreview.loading}
        blocks={ws.docPreview.blocks}
        error={ws.docPreview.error}
        onClose={ws.closeDocumentPreview}
      />
      <SubmitDialog open={submitOpen} busy={ws.busy} onClose={() => setSubmitOpen(false)} onConfirm={confirmSubmit} />
    </Box>
  );
};

export default ProfessorTutorWorkspace;
