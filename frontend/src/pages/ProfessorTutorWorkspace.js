import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../contexts/AuthContext';
import useWorkspace from '../hooks/useWorkspace';
import useWorkspaceTabs from '../hooks/useWorkspaceTabs';
import EmptyState from '../components/Workspace/EmptyState';
import ChatInput from '../components/Workspace/ChatInput';
import MessageItem, { payloadOf } from '../components/Workspace/messages/MessageItem';
import PendingReply from '../components/Workspace/messages/PendingReply';
import Bubble from '../components/Workspace/messages/Bubble';
import WorkspaceTabs from '../components/Workspace/WorkspaceTabs';
import SyllabusStructurePanel from '../components/Workspace/SyllabusStructurePanel';
import LiveDocumentPanel from '../components/Workspace/LiveDocumentPanel';
import WorkspaceBanners from '../components/Workspace/WorkspaceBanners';
import AnalysisProgress from '../components/Workspace/AnalysisProgress';
import { USE_MOCKS } from '../services/workspaceClient';
import { S } from '../strings';

const ProfessorTutorWorkspace = ({ client, mockId }) => {
  const { syllabusId: routeId } = useParams();
  const syllabusId = mockId || routeId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const wide = useMediaQuery(useTheme().breakpoints.up('md'));
  const { openTabs, closeTab, ensureTab, dropMissing } = useWorkspaceTabs(user, mockId ? null : syllabusId);
  const ws = useWorkspace(syllabusId, {
    client,
    onNotFound: dropMissing,
    onLoaded: (syl) => { if (syl && !mockId) ensureTab(syl.id || syllabusId, syl.title); },
  });
  const [drawer, setDrawer] = useState(null);
  const [focusedKey, setFocusedKey] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null);
  const threadRef = useRef(null);
  const highlightTimer = useRef(null);
  const { messages, suggestions, syllabus } = ws;
  useEffect(() => () => clearTimeout(highlightTimer.current), []);
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, ws.pendingText]);
  useEffect(() => { setFocusedKey(null); }, [syllabusId]);

  const suggestionById = useMemo(() => new Map(suggestions.map((s) => [s.id, s])), [suggestions]);
  const sectionsByKey = useMemo(() => new Map(ws.sections.map((s) => [s.key, s])), [ws.sections]);
  const activeQuestion = [...messages].reverse().find((m) => m.kind === 'question' && payloadOf(m).slotKey === ws.conversation?.currentSlotKey)?._id;
  const latest = useMemo(() => {
    const map = new Map();
    messages.forEach((m) => { if (m.kind === 'suggestion') map.set(m.relatedSuggestionId, m._id); });
    return map;
  }, [messages]);

  const scrollToSuggestion = useCallback((id) => {
    const target = document.getElementById(id.startsWith('policy:') ? `policy-${id.slice(7)}` : `suggestion-${id}`);
    const el = threadRef.current;
    if (target && el) el.scrollTo({ top: target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 24, behavior: 'smooth' });
    setHighlightedId(id);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 1600);
  }, []);

  const selectSection = (key) => {
    setFocusedKey(key);
    const sg = suggestions.find((s) => s.section === key && s.status === 'pending');
    if (sg) scrollToSuggestion(sg.id);
  };
  const tabs = !mockId && <WorkspaceTabs tabs={openTabs} activeId={syllabusId} onSelect={(id) => navigate(`/workspace/${id}`)} onClose={closeTab} onNew={() => navigate('/workspace')} />;
  if (!syllabusId) return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {openTabs.length > 0 && tabs}
      <Box sx={{ overflow: 'auto', flex: 1 }}><EmptyState onUploaded={(id) => { ensureTab(id, ''); navigate(`/workspace/${id}`); }} /></Box>
    </Box>
  );

  const analyzing = syllabus?.status === 'analyzing';
  const failed = syllabus?.status === 'error';
  const ready = ws.loaded && !analyzing && !failed && !ws.needsRebuild;
  const ctx = {
    actions: ws.actions, busy: ws.busy, readOnly: ws.readOnly || !ready, highlightedId,
    sectionsByKey, sections: ws.sections, readiness: ws.readiness, policyLibrary: ws.policyLibrary,
    statePolicies: ws.state?.policies || [], documentSections: ws.document.sections || [], onSelectSuggestion: scrollToSuggestion,
  };
  const structure = <SyllabusStructurePanel sections={ws.sections} readiness={ws.readiness} checks={ws.checks} suggestions={suggestions} conversation={ws.conversation} focusedKey={focusedKey} onSelect={selectSection} actions={ws.actions} busy={ws.busy} readOnly={ws.readOnly || !ready} />;
  const documentPanel = <LiveDocumentPanel document={ws.loaded && !ws.state ? { sections: [], error: ws.needsRebuild ? S.rebuildBanner : '' } : ws.document} templateSections={ws.sections} diff={ws.diff} onToggleDiff={ws.setDiff} onDownload={ws.downloadDocx} downloading={ws.downloading} canDownload={!!ws.state} focusedKey={focusedKey} />;

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {tabs}
      {(USE_MOCKS || mockId) && <Alert severity="info" sx={{ borderRadius: 0 }}>{S.mocksBanner}</Alert>}
      {ws.error && <Alert severity="error" onClose={ws.clearError} sx={{ borderRadius: 0 }}>{ws.error}</Alert>}
      <WorkspaceBanners syllabus={syllabus} busy={ws.busy} onRebuild={ws.reanalyze} onUploadAgain={() => navigate('/workspace')} />
      {!wide && <Stack direction="row" spacing={1} sx={{ px: 2, py: 1 }}><Button onClick={() => setDrawer('structure')}>Syllabus structure</Button><Button variant="contained" onClick={() => setDrawer('document')}>{S.document}</Button></Stack>}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
        {wide && <Box sx={{ width: '22%', minWidth: 190, maxWidth: 280, borderRight: '1px solid', borderColor: 'divider' }}>{structure}</Box>}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Box ref={threadRef} sx={{ flex: 1, overflow: 'auto', p: { xs: 1.5, md: 2 } }}>
            {ws.loading && !ws.loaded ? <Box sx={{ textAlign: 'center', mt: 6 }}><CircularProgress /><Typography>{S.loadingConversation}</Typography></Box>
              : analyzing || failed ? <AnalysisProgress stage={ws.analysis.stage} error={ws.analysis.error} failed={failed} timedOut={ws.analysis.timedOut} busy={ws.busy} onRetry={ws.reanalyze} />
                : ws.loaded && <>
                  {!messages.length && <Alert severity="info">{S.noMessages}</Alert>}
                  {messages.map((m, i) => <MessageItem key={m._id} message={m} suggestion={suggestionById.get(m.relatedSuggestionId)} isLatestForSuggestion={latest.get(m.relatedSuggestionId) === m._id} isLast={activeQuestion ? m._id === activeQuestion : i === messages.length - 1} ctx={ctx} />)}
                  {ws.pendingText && <><Bubble role="user"><Typography sx={{ whiteSpace: 'pre-wrap' }}>{ws.pendingText}</Typography></Bubble><PendingReply /></>}
                </>}
          </Box>
          <ChatInput key={syllabusId} onSend={ws.sendMessage} disabled={!ready || ws.readOnly || ws.busy} />
        </Box>
        {wide && <Box sx={{ width: '36%', minWidth: 280, borderLeft: '1px solid', borderColor: 'divider' }}>{documentPanel}</Box>}
      </Box>
      {!wide && <Drawer anchor={drawer === 'structure' ? 'left' : 'right'} open={!!drawer} onClose={() => setDrawer(null)} PaperProps={{ sx: { width: 'min(94vw, 540px)' } }}><Button onClick={() => setDrawer(null)}>Back to chat</Button>{drawer === 'structure' ? structure : documentPanel}</Drawer>}
    </Box>
  );
};
export default ProfessorTutorWorkspace;
