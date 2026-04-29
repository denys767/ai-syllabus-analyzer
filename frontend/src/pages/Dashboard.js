import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Paper,
  Radio,
  RadioGroup,
  FormControlLabel,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add,
  AutoAwesome,
  CheckCircle,
  CloudUpload,
  ExpandMore,
  OpenInNew,
  RadioButtonUnchecked,
  Send,
  WarningAmber,
} from '@mui/icons-material';
import { Navigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';

import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const programOptions = ['MBA', 'EMBA', 'Corporate', 'Intensive'];

function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const [syllabi, setSyllabi] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [composer, setComposer] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [error, setError] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadForm, setUploadForm] = useState({
    file: null,
    courseName: '',
    courseCode: '',
    program: 'MBA',
  });
  const [choiceDrafts, setChoiceDrafts] = useState({});

  const isInstructorWorkspace = user?.role !== 'admin';

  const loadSyllabi = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingList(true);
      const response = await api.syllabus.getMySyllabi();
      const items = response.data.syllabi || [];
      setSyllabi(items);
      if (!activeId && items.length > 0) {
        setActiveId(items[0]._id);
      }
      if (!items.length) {
        setCreatingNew(true);
      }
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Failed to load syllabi.');
    } finally {
      if (!silent) setLoadingList(false);
    }
  }, [activeId]);

  const loadWorkspace = useCallback(async (id, silent = false) => {
    try {
      if (!silent) setLoadingWorkspace(true);
      const response = await api.syllabus.getSyllabus(id);
      setActiveWorkspace(response.data);
      setError('');
      setCreatingNew(false);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Failed to load workspace.');
    } finally {
      if (!silent) setLoadingWorkspace(false);
    }
  }, []);

  useEffect(() => {
    if (!isInstructorWorkspace) return;
    loadSyllabi();
  }, [isInstructorWorkspace, loadSyllabi]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const syllabusId = params.get('syllabus');
    if (syllabusId) {
      setActiveId(syllabusId);
      setCreatingNew(false);
    }
  }, [location.search]);

  useEffect(() => {
    if (!activeId) return;
    loadWorkspace(activeId, true);
  }, [activeId, loadWorkspace]);

  useEffect(() => {
    if (activeWorkspace?.status !== 'processing' || !activeWorkspace?._id) return;
    const timer = setInterval(() => {
      loadWorkspace(activeWorkspace._id, true);
      loadSyllabi(true);
    }, 4000);
    return () => clearInterval(timer);
  }, [activeWorkspace, loadSyllabi, loadWorkspace]);

  const dropzone = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    onDrop: (acceptedFiles, rejectedFiles) => {
      if (rejectedFiles.length) {
        setError(rejectedFiles[0]?.errors?.[0]?.message || 'File was rejected.');
        return;
      }
      const [file] = acceptedFiles;
      setUploadForm((current) => ({
        ...current,
        file,
        courseName: current.courseName || file.name.replace(/\.[^.]+$/, ''),
      }));
      setError('');
    },
  });

  async function handleUpload() {
    if (!uploadForm.file || !uploadForm.courseName.trim()) {
      setError('Add a syllabus file and course name before uploading.');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);
      const formData = new FormData();
      formData.append('syllabus', uploadForm.file);
      formData.append('courseName', uploadForm.courseName.trim());
      formData.append('courseCode', uploadForm.courseCode.trim());
      formData.append('program', uploadForm.program);

      const response = await api.syllabus.upload(formData, {
        onUploadProgress: (progressEvent) => {
          const nextPct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(nextPct);
        },
      });

      const uploaded = response.data.syllabus;
      setUploadForm({ file: null, courseName: '', courseCode: '', program: 'MBA' });
      setCreatingNew(false);
      await loadSyllabi(true);
      setActiveId(uploaded._id);
      await loadWorkspace(uploaded._id);
    } catch (uploadError) {
      setError(uploadError.response?.data?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function pushWorkspaceUpdate(requestPromise) {
    try {
      const response = await requestPromise;
      setActiveWorkspace(response.data);
      await loadSyllabi(true);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Something went wrong.');
    }
  }

  async function handleSendMessage() {
    if (!composer.trim() || !activeWorkspace?._id) return;
    setChatSending(true);
    const message = composer.trim();
    setComposer('');
    await pushWorkspaceUpdate(api.syllabus.sendChatMessage(activeWorkspace._id, message));
    setChatSending(false);
  }

  async function handlePreview() {
    if (!activeWorkspace?._id) return;
    try {
      const response = await api.syllabus.previewFinal(activeWorkspace._id);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (previewError) {
      setError(previewError.response?.data?.message || 'Preview failed.');
    }
  }

  const issues = useMemo(() => activeWorkspace?.workflow?.issues || [], [activeWorkspace]);
  const readiness = activeWorkspace?.workflow?.readiness;
  const issueMap = useMemo(
    () => Object.fromEntries(issues.map((issue) => [issue.id, issue])),
    [issues]
  );

  if (!isInstructorWorkspace) {
    return <Navigate to="/cabinet" replace />;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <WorkspaceTabs
        syllabi={syllabi}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={() => {
          setCreatingNew(true);
          setActiveWorkspace(null);
          setActiveId('');
        }}
        loading={loadingList}
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '280px minmax(0, 1fr)' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <IssuesSidebar readiness={readiness} issues={issues} />

        <Stack spacing={3}>
          <ProfessorHero />

          {(creatingNew || !activeWorkspace) && (
            <UploadComposer
              dropzone={dropzone}
              uploadForm={uploadForm}
              setUploadForm={setUploadForm}
              onUpload={handleUpload}
              uploading={uploading}
              uploadProgress={uploadProgress}
            />
          )}

          {loadingWorkspace && (
            <Paper sx={{ p: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={24} />
              <Typography>Loading workspace…</Typography>
            </Paper>
          )}

          {activeWorkspace && (
            <Paper
              sx={{
                p: 2,
                borderRadius: 4,
                border: '1px solid',
                borderColor: 'divider',
                background:
                  'linear-gradient(180deg, rgba(244,248,246,1) 0%, rgba(255,255,255,1) 18%)',
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h4">{activeWorkspace.title}</Typography>
                  <Typography color="text.secondary">
                    {activeWorkspace.program} · {activeWorkspace.course?.code || 'No course code'}
                  </Typography>
                </Box>
                <Chip
                  label={activeWorkspace.workspaceStatus}
                  color={activeWorkspace.workspaceStatus === 'Submitted' ? 'success' : 'default'}
                />
              </Stack>

              <ChatTimeline messages={activeWorkspace.workflow?.messages || []} issueMap={issueMap} onAction={async (action) => {
                if (action.type === 'confirm') {
                  await pushWorkspaceUpdate(api.syllabus.confirmIssue(activeWorkspace._id, action.issueId));
                }
                if (action.type === 'cancel') {
                  await pushWorkspaceUpdate(api.syllabus.cancelIssue(activeWorkspace._id, action.issueId));
                }
                if (action.type === 'choice') {
                  const draft = choiceDrafts[action.issueId] || {};
                  await pushWorkspaceUpdate(
                    api.syllabus.applyChoice(
                      activeWorkspace._id,
                      action.issueId,
                      draft.optionId,
                      draft.customNote || ''
                    )
                  );
                }
                if (action.type === 'case') {
                  await pushWorkspaceUpdate(
                    api.syllabus.addCaseCard(activeWorkspace._id, action.issueId, action.cardId, action.preview)
                  );
                }
              }} choiceDrafts={choiceDrafts} setChoiceDrafts={setChoiceDrafts} />

              {activeWorkspace.status === 'processing' && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Professor&apos;s Tutor is analyzing your syllabus. This usually takes under two minutes.
                </Alert>
              )}

              {readiness?.canSubmit && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 3 }}>
                  <Button variant="outlined" startIcon={<OpenInNew />} onClick={handlePreview}>
                    Preview final syllabus
                  </Button>
                  <Button
                    variant="contained"
                    endIcon={<CheckCircle />}
                    onClick={() => pushWorkspaceUpdate(api.syllabus.submitFinal(activeWorkspace._id))}
                    disabled={activeWorkspace.workspaceStatus === 'Submitted'}
                  >
                    {activeWorkspace.workspaceStatus === 'Submitted' ? 'Submitted' : 'Submit'}
                  </Button>
                </Stack>
              )}

              <Divider sx={{ my: 3 }} />

              <Stack direction="row" spacing={1} alignItems="flex-end">
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={5}
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  placeholder="Type a message..."
                />
                <Button
                  variant="contained"
                  endIcon={chatSending ? <CircularProgress size={16} color="inherit" /> : <Send />}
                  onClick={handleSendMessage}
                  disabled={!composer.trim() || chatSending || !activeWorkspace}
                  sx={{ minWidth: 140, height: 56 }}
                >
                  Send
                </Button>
              </Stack>
            </Paper>
          )}
        </Stack>
      </Box>
    </Box>
  );
}

function WorkspaceTabs({ syllabi, activeId, onSelect, onNew, loading }) {
  return (
    <Paper sx={{ p: 1.5, borderRadius: 4 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Tabs
          value={activeId || false}
          onChange={(_, value) => onSelect(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 48, flex: 1 }}
        >
          {syllabi.map((syllabus) => (
            <Tab
              key={syllabus._id}
              value={syllabus._id}
              label={`${syllabus.title} · ${syllabus.readinessPct || 0}%`}
              sx={{ alignItems: 'flex-start', textTransform: 'none', minHeight: 48 }}
            />
          ))}
        </Tabs>
        <Button variant="outlined" startIcon={<Add />} onClick={onNew}>
          New
        </Button>
      </Stack>
      {loading && <LinearProgress sx={{ mt: 1 }} />}
    </Paper>
  );
}

function ProfessorHero() {
  return (
    <Paper
      sx={{
        p: 3,
        borderRadius: 4,
        color: '#18322b',
        background:
          'radial-gradient(circle at top left, rgba(198,230,219,0.85), rgba(255,255,255,1) 60%), linear-gradient(135deg, #f0f6f4 0%, #ffffff 100%)',
      }}
    >
      <Stack spacing={2}>
        <Chip
          label="Professor's Tutor"
          icon={<AutoAwesome />}
          sx={{ width: 'fit-content', backgroundColor: 'rgba(255,255,255,0.8)' }}
        />
        <Typography variant="h3" sx={{ maxWidth: 720 }}>
          A chat-first workspace for getting your syllabus ready, one issue at a time.
        </Typography>
        <Typography sx={{ maxWidth: 760 }}>
          Upload your draft, review AI guidance in sequence, confirm the changes you want, and submit a final PDF once everything required is resolved.
        </Typography>
      </Stack>
    </Paper>
  );
}

function UploadComposer({ dropzone, uploadForm, setUploadForm, onUpload, uploading, uploadProgress }) {
  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Stack spacing={3}>
          <ChatBubble
            role="assistant"
            content="Hi! I'm here to help you build a syllabus that meets all KSE Graduate Business School standards. Upload your draft and I'll take it from there."
          />

          <Paper
            {...dropzone.getRootProps()}
            sx={{
              p: 4,
              border: '2px dashed',
              borderColor: dropzone.isDragActive ? 'primary.main' : 'divider',
              borderRadius: 4,
              backgroundColor: dropzone.isDragActive ? 'rgba(0,102,90,0.05)' : 'background.paper',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <input {...dropzone.getInputProps()} />
            <CloudUpload sx={{ fontSize: 56, color: 'primary.main', mb: 1 }} />
            <Typography variant="h6">Drop your syllabus here or click to browse · PDF, DOCX</Typography>
            <Typography color="text.secondary">
              {uploadForm.file ? uploadForm.file.name : 'Maximum size: 10 MB'}
            </Typography>
          </Paper>

          <Accordion disableGutters>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography fontWeight={600}>How does this work?</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1.5}>
                <Typography>1. Upload your syllabus draft.</Typography>
                <Typography>2. Professor&apos;s Tutor checks it against KSE standards.</Typography>
                <Typography>3. You fix issues together, one at a time.</Typography>
                <Typography>4. Preview the final PDF and submit it to the Academic Director.</Typography>
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              fullWidth
              label="Course name"
              value={uploadForm.courseName}
              onChange={(event) => setUploadForm((current) => ({ ...current, courseName: event.target.value }))}
            />
            <TextField
              fullWidth
              label="Course code"
              value={uploadForm.courseCode}
              onChange={(event) => setUploadForm((current) => ({ ...current, courseCode: event.target.value }))}
            />
            <TextField
              select
              label="Program"
              value={uploadForm.program}
              onChange={(event) => setUploadForm((current) => ({ ...current, program: event.target.value }))}
              SelectProps={{ native: true }}
              sx={{ minWidth: 180 }}
            >
              {programOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </TextField>
          </Stack>

          <Button variant="contained" onClick={onUpload} disabled={uploading} sx={{ alignSelf: 'flex-start' }}>
            {uploading ? 'Uploading…' : 'Upload and analyze'}
          </Button>
          {uploading && <LinearProgress variant="determinate" value={uploadProgress} />}
        </Stack>
      </CardContent>
    </Card>
  );
}

function IssuesSidebar({ readiness, issues }) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 4, position: { lg: 'sticky' }, top: { lg: 96 } }}>
      <Typography variant="h6" gutterBottom>
        Issues
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {readiness?.openIssues || 0} open · {readiness?.resolvedIssues || 0} resolved
      </Typography>

      <Stack spacing={1.25}>
        {issues.map((issue) => (
          <Stack key={issue.id} direction="row" spacing={1.25} alignItems="flex-start">
            {issue.severity === 'critical' ? (
              <WarningAmber color="warning" fontSize="small" sx={{ mt: 0.25 }} />
            ) : (
              <RadioButtonUnchecked color="disabled" fontSize="small" sx={{ mt: 0.25 }} />
            )}
            <Box sx={{ flex: 1, opacity: issue.state === 'resolved' ? 0.55 : 1 }}>
              <Typography sx={{ textDecoration: issue.state === 'resolved' ? 'line-through' : 'none' }}>
                {issue.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {issue.state === 'resolved' ? 'Resolved ✓' : 'Open'}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Stack>

      <Divider sx={{ my: 2 }} />
      <Typography fontWeight={600}>Readiness · {readiness?.pct || 0}%</Typography>
      <LinearProgress
        variant="determinate"
        value={readiness?.pct || 0}
        sx={{ mt: 1, mb: 1.5, height: 10, borderRadius: 999 }}
      />
      <Typography color="text.secondary">
        {readiness?.canSubmit ? 'Ready to submit ✓' : readiness?.label || 'Needs work'}
      </Typography>
    </Paper>
  );
}

function ChatTimeline({ messages, issueMap, onAction, choiceDrafts, setChoiceDrafts }) {
  return (
    <Stack spacing={2}>
      {messages.map((message) => (
        <Box key={message.id}>
          <ChatBubble role={message.role} content={message.content} kind={message.kind} />
          {message.issueId && issueMap[message.issueId] && (
            <IssueMessageCard
              issue={issueMap[message.issueId]}
              onAction={onAction}
              choiceDraft={choiceDrafts[message.issueId] || {}}
              setChoiceDraft={(next) =>
                setChoiceDrafts((current) => ({
                  ...current,
                  [message.issueId]: {
                    ...(current[message.issueId] || {}),
                    ...next,
                  },
                }))
              }
            />
          )}
        </Box>
      ))}
    </Stack>
  );
}

function ChatBubble({ role, content, kind }) {
  const isAssistant = role === 'assistant';
  return (
    <Box sx={{ display: 'flex', justifyContent: isAssistant ? 'flex-start' : 'flex-end', mb: 1 }}>
      <Paper
        sx={{
          p: 1.75,
          maxWidth: '85%',
          borderRadius: 3,
          backgroundColor: isAssistant ? '#f4f7fb' : '#dff2ed',
          border: '1px solid',
          borderColor: isAssistant ? '#d9e3ef' : '#badfd4',
        }}
      >
        {kind && kind !== 'chat' && (
          <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {kind}
          </Typography>
        )}
        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{content}</Typography>
      </Paper>
    </Box>
  );
}

function IssueMessageCard({ issue, onAction, choiceDraft, setChoiceDraft }) {
  return (
    <Card sx={{ mt: 1.5, borderRadius: 4 }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
            <Box>
              <Typography variant="h6">{issue.title}</Typography>
              <Typography color="text.secondary">{issue.description}</Typography>
            </Box>
            <Chip
              label={issue.state === 'resolved' ? issue.decision || 'resolved' : issue.severity}
              color={issue.state === 'resolved' ? 'success' : issue.severity === 'critical' ? 'warning' : 'default'}
            />
          </Stack>

          {issue.kind === 'diff' && (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Paper sx={{ p: 2, flex: 1, bgcolor: '#fff8f8', border: '1px solid #f1d1d1' }}>
                <Typography variant="caption" color="error.main">
                  BEFORE
                </Typography>
                <Typography sx={{ textDecoration: 'line-through', mt: 1 }}>{issue.beforeText || 'Missing or unclear content.'}</Typography>
              </Paper>
              <Paper sx={{ p: 2, flex: 1, bgcolor: '#f4fbf6', border: '1px solid #cde8d4' }}>
                <Typography variant="caption" color="success.main">
                  AFTER
                </Typography>
                <Typography sx={{ mt: 1 }}>{issue.afterText || 'AI will prepare improved wording here.'}</Typography>
              </Paper>
            </Stack>
          )}

          {issue.kind === 'choice' && issue.choice && (
            <Box>
              <Typography fontWeight={600} sx={{ mb: 1 }}>
                {issue.choice.prompt}
              </Typography>
              <RadioGroup
                value={choiceDraft.optionId || issue.choice.selectedOptionId || ''}
                onChange={(event) => setChoiceDraft({ optionId: event.target.value })}
              >
                {issue.choice.options.map((option) => (
                  <FormControlLabel
                    key={option.id}
                    value={option.id}
                    control={<Radio />}
                    label={
                      <Box>
                        <Typography>
                          {option.label}
                          {option.isRecommended ? ' (Recommended)' : ''}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {option.description}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </RadioGroup>
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Custom note"
                value={choiceDraft.customNote || issue.choice.customNote || ''}
                onChange={(event) => setChoiceDraft({ customNote: event.target.value })}
                helperText={issue.choice.customPrompt}
                sx={{ mt: 1.5 }}
              />
              {!!(issue.choice.appliedText || issue.afterText) && (
                <Paper sx={{ mt: 1.5, p: 2, bgcolor: '#f4fbf6', border: '1px solid #cde8d4' }}>
                  <Typography variant="caption" color="success.main">
                    SELECTED TEXT
                  </Typography>
                  <Typography sx={{ mt: 1 }}>{issue.choice.appliedText || issue.afterText}</Typography>
                </Paper>
              )}
            </Box>
          )}

          {issue.kind === 'case_recommendation' && issue.caseRecommendation && (
            <Box>
              <Typography fontWeight={600} sx={{ mb: 1.5 }}>
                Case Recommendations — {issue.caseRecommendation.weekLabel}
              </Typography>
              <Stack spacing={1.5}>
                {issue.caseRecommendation.cards.map((card) => {
                  const selected = (issue.caseRecommendation.selectedCardIds || []).includes(card.id);
                  return (
                    <Paper key={card.id} sx={{ p: 2, border: '1px solid', borderColor: selected ? 'success.main' : 'divider' }}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5}>
                        <Box>
                          <Typography fontWeight={600}>{card.title}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {card.source} · {card.fitLabel}
                          </Typography>
                          <Typography sx={{ mt: 1 }}>{card.previewText}</Typography>
                        </Box>
                        <Stack direction={{ xs: 'row', sm: 'column' }} spacing={1}>
                          <Button variant="outlined" onClick={() => onAction({ type: 'case', issueId: issue.id, cardId: card.id, preview: true })}>
                            Preview
                          </Button>
                          <Button variant={selected ? 'contained' : 'outlined'} onClick={() => onAction({ type: 'case', issueId: issue.id, cardId: card.id, preview: false })}>
                            {selected ? 'Added' : 'Add'}
                          </Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            </Box>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {issue.kind === 'choice' && (
              <Button
                variant="contained"
                disabled={issue.state === 'resolved' && issue.decision === 'confirmed'}
                onClick={() => onAction({ type: 'choice', issueId: issue.id })}
              >
                Apply selected
              </Button>
            )}
            <Button
              variant="contained"
              color="success"
              disabled={issue.state === 'resolved' && issue.decision === 'confirmed'}
              onClick={() => onAction({ type: 'confirm', issueId: issue.id })}
            >
              Confirm change
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => onAction({ type: 'cancel', issueId: issue.id })}
            >
              Cancel
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default Dashboard;
