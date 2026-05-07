import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  CircularProgress,
  TextField,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Link,
} from '@mui/material';
import { Check, Close, Visibility, Send } from '@mui/icons-material';

const Bubble = ({ role, children, sx }) => {
  const isUser = role === 'user';
  return (
    <Box sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', mb: 1.5 }}>
      <Paper
        elevation={0}
        sx={{
          maxWidth: '85%',
          p: 1.5,
          bgcolor: isUser ? 'primary.main' : 'background.paper',
          color: isUser ? 'primary.contrastText' : 'text.primary',
          border: isUser ? 'none' : '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          ...sx,
        }}
      >
        {children}
      </Paper>
    </Box>
  );
};

const markdownComponents = {
  p: ({ children }) => (
    <Typography component="p" variant="body2" sx={{ mb: 0.75, '&:last-child': { mb: 0 } }}>
      {children}
    </Typography>
  ),
  li: ({ children }) => (
    <Typography component="li" variant="body2" sx={{ mb: 0.25 }}>
      {children}
    </Typography>
  ),
  strong: ({ children }) => <Box component="strong" sx={{ fontWeight: 700 }}>{children}</Box>,
  a: ({ href, children }) => (
    <Link href={href} target="_blank" rel="noreferrer" color="inherit" underline="hover">
      {children}
    </Link>
  ),
  table: ({ children }) => (
    <Box component="div" sx={{ overflowX: 'auto', my: 1 }}>
      <Box
        component="table"
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          '& th, & td': {
            border: '1px solid',
            borderColor: 'divider',
            px: 1,
            py: 0.75,
            verticalAlign: 'top',
          },
          '& th': { bgcolor: 'action.hover', fontWeight: 700 },
        }}
      >
        {children}
      </Box>
    </Box>
  ),
};

const MarkdownText = ({ children, sx }) => (
  <Box
    sx={{
      overflowWrap: 'anywhere',
      '& ul, & ol': { pl: 2.5, my: 0.75 },
      '& h1, & h2, & h3, & h4': {
        fontSize: '1rem',
        lineHeight: 1.35,
        fontWeight: 700,
        mt: 1,
        mb: 0.5,
      },
      '& code': {
        px: 0.4,
        py: 0.1,
        borderRadius: 0.5,
        bgcolor: 'action.hover',
        fontFamily: 'monospace',
      },
      ...sx,
    }}
  >
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{String(children || '')}</ReactMarkdown>
  </Box>
);

function splitTextIntoParagraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function optionDisplayText(option) {
  if (option?.text) return option.text;
  if (option?.previewText) return option.previewText;
  const editText = (option?.edits || [])
    .map((edit) => edit.newText)
    .filter(Boolean)
    .join('\n\n');
  return editText || '';
}

function canCancelIssue(message, issue) {
  const priority = issue?.priority || message.payload?.priority;
  return !['critical', 'high'].includes(priority);
}

const BeforeAfter = ({ message, issue, onConfirm, onCancel, onIssuePreview, busy, isCurrent }) => {
  const before = message.payload?.before;
  const after = message.payload?.after;
  const editBlocks = Array.isArray(message.payload?.editBlocks) ? message.payload.editBlocks : null;
  const editCount = Array.isArray(message.payload?.edits) ? message.payload.edits.length : 1;
  const beforeParts = editBlocks ? editBlocks.map((block) => block.before) : (editCount > 1 ? splitTextIntoParagraphs(before) : [before || '(missing section)']);
  const afterParts = editBlocks ? editBlocks.map((block) => block.after) : (editCount > 1 ? splitTextIntoParagraphs(after) : [after || '']);
  const blockCount = Math.max(beforeParts.length, afterParts.length, 1);
  const panelSx = {
    p: 1.5,
    borderRadius: 1,
    border: '1px solid',
  };
  const showCancel = canCancelIssue(message, issue);
  const beforePanelSx = {
    ...panelSx,
    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(244, 67, 54, 0.14)' : '#fff5f5',
    borderColor: 'error.light',
  };
  const afterPanelSx = {
    ...panelSx,
    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(76, 175, 80, 0.14)' : '#f0fff4',
    borderColor: 'success.light',
  };

  return (
    <Bubble role="ai" sx={{ maxWidth: '95%' }}>
      <MarkdownText sx={{ mb: 1.5 }}>{message.content}</MarkdownText>
      {isCurrent && !showCancel && (
        <Chip
          size="small"
          color="warning"
          label="Important for syllabus readiness. No cancel"
          sx={{ mb: 1.5 }}
        />
      )}
      <Stack spacing={1.5} sx={{ mb: 1.5 }}>
        {Array.from({ length: blockCount }).map((_, index) => (
          <Box key={index}>
            {blockCount > 1 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 700 }}>
                Change {index + 1}
              </Typography>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
              <Box sx={beforePanelSx}>
                <Typography variant="overline" display="block" sx={{ color: 'error.dark', fontWeight: 700 }}>
                  Before
                </Typography>
                <MarkdownText sx={{ color: 'text.primary' }}>
                  {beforeParts[index] || '(missing section)'}
                </MarkdownText>
              </Box>
              <Box sx={afterPanelSx}>
                <Typography variant="overline" display="block" sx={{ color: 'success.dark', fontWeight: 700 }}>
                  After
                </Typography>
                <MarkdownText sx={{ color: 'text.primary' }}>
                  {afterParts[index] || ''}
                </MarkdownText>
              </Box>
            </Box>
          </Box>
        ))}
      </Stack>
      {isCurrent && (
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <Check />}
            disabled={busy}
            onClick={() => onConfirm(message.relatedIssueId)}
          >
            Confirm change
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Visibility />}
            disabled={busy}
            onClick={() => onIssuePreview && onIssuePreview(message.relatedIssueId)}
          >
            Preview
          </Button>
          {showCancel && (
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<Close />}
              disabled={busy}
              onClick={() => onCancel(message.relatedIssueId)}
            >
              Cancel
            </Button>
          )}
        </Stack>
      )}
    </Bubble>
  );
};

const SubmissionCta = ({ message, onPreview, onSubmit, busy }) => (
  <Bubble role="ai">
    <MarkdownText sx={{ mb: 1.5 }}>{message.content}</MarkdownText>
    <Stack direction="row" spacing={1}>
      <Button size="small" variant="outlined" startIcon={<Visibility />} disabled={busy} onClick={onPreview}>
        Preview final syllabus
      </Button>
      <Button size="small" variant="contained" endIcon={<Send />} disabled={busy} onClick={onSubmit}>
        Submit
      </Button>
    </Stack>
  </Bubble>
);

const ChoiceMessage = ({ message, issue, onConfirm, onCancel, onIssuePreview, busy, isCurrent }) => {
  const options = message.payload?.options || [];
  const [optionId, setOptionId] = useState(options[0]?.id || '');
  const [customNote, setCustomNote] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const canApply = customMode ? customText.trim().length > 0 : !!optionId;
  const showCancel = canCancelIssue(message, issue);

  return (
    <Bubble role="ai" sx={{ maxWidth: '95%' }}>
      <MarkdownText sx={{ mb: 1.5 }}>{message.content}</MarkdownText>
      {isCurrent && !showCancel && (
        <Chip
          size="small"
          color="warning"
          label="Important for syllabus readiness. No cancel"
          sx={{ mb: 1.5 }}
        />
      )}
      {!customMode ? (
        <RadioGroup value={optionId} onChange={(event) => setOptionId(event.target.value)}>
          <Stack spacing={1}>
            {options.map((option) => (
              <Paper key={option.id} variant="outlined" sx={{ p: 1.25, borderRadius: 1 }}>
                <FormControlLabel
                  value={option.id}
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="subtitle2">{option.label}</Typography>
                      <MarkdownText sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        {optionDisplayText(option)}
                      </MarkdownText>
                      {option.rationale && (
                        <MarkdownText sx={{ color: 'text.secondary', '& p': { fontSize: '0.75rem' } }}>
                          {option.rationale}
                        </MarkdownText>
                      )}
                    </Box>
                  }
                  sx={{ alignItems: 'flex-start', m: 0 }}
                />
              </Paper>
            ))}
          </Stack>
        </RadioGroup>
      ) : (
        <TextField
          fullWidth
          multiline
          minRows={4}
          label="Your policy text"
          value={customText}
          onChange={(event) => setCustomText(event.target.value)}
          sx={{ mb: 1.5 }}
        />
      )}
      {!customMode && (
        <TextField
          fullWidth
          multiline
          minRows={2}
          label="Optional custom note"
          value={customNote}
          onChange={(event) => setCustomNote(event.target.value)}
          sx={{ mt: 1.5, mb: 1.5 }}
        />
      )}
      {isCurrent && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <Check />}
            disabled={busy || !canApply}
            onClick={() => onConfirm(
              message.relatedIssueId,
              customMode ? { customText: customText.trim() } : { optionId, customNote: customNote.trim() }
            )}
          >
            {customMode ? 'Apply my text' : 'Apply selected'}
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={busy}
            onClick={() => setCustomMode((value) => !value)}
          >
            {customMode ? 'Back to options' : 'Write my own'}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Visibility />}
            disabled={busy || customMode || !optionId}
            onClick={() => onIssuePreview && onIssuePreview(
              message.relatedIssueId,
              { optionId, customNote: customNote.trim() }
            )}
          >
            Preview
          </Button>
          {showCancel && (
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<Close />}
              disabled={busy}
              onClick={() => onCancel(message.relatedIssueId)}
            >
              Cancel
            </Button>
          )}
        </Stack>
      )}
    </Bubble>
  );
};

const CaseCardsMessage = ({ message, issue, onConfirm, onCancel, onIssuePreview, busy, isCurrent }) => {
  const cards = message.payload?.cards || [];
  const [previewCard, setPreviewCard] = useState(null);
  const [selectedCaseIds, setSelectedCaseIds] = useState(() => (cards[0]?.id ? [cards[0].id] : []));
  const toggleCase = (id) => {
    setSelectedCaseIds((current) => (
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    ));
  };
  const canApply = selectedCaseIds.length > 0;
  const showCancel = canCancelIssue(message, issue);

  return (
    <Bubble role="ai" sx={{ maxWidth: '95%' }}>
      <MarkdownText sx={{ mb: 1.5 }}>{message.content}</MarkdownText>
      {isCurrent && !showCancel && (
        <Chip
          size="small"
          color="warning"
          label="Important for syllabus readiness. No cancel"
          sx={{ mb: 1.5 }}
        />
      )}
      {message.payload?.week && (
        <Chip size="small" label={`Case Recommendations - ${message.payload.week}`} sx={{ mb: 1.5 }} />
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25, mb: 1.5 }}>
        {cards.map((card) => (
          <Paper key={card.id} variant="outlined" sx={{ p: 1.25, borderRadius: 1 }}>
            <Stack spacing={0.75}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={selectedCaseIds.includes(card.id)}
                    onChange={() => toggleCase(card.id)}
                    disabled={!isCurrent || busy}
                  />
                }
                label={
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                    <Typography variant="subtitle2">{card.title}</Typography>
                    {card.fitLabel && <Chip size="small" color="success" label={card.fitLabel} />}
                  </Stack>
                }
                sx={{ m: 0, alignItems: 'flex-start' }}
              />
              <Typography variant="caption" color="text.secondary">
                {card.sourceUrl ? (
                  <Link href={card.sourceUrl} target="_blank" rel="noreferrer">
                    {card.sourceLabel || card.sourceUrl}
                  </Link>
                ) : (card.sourceLabel || 'Source not provided')}
              </Typography>
              <MarkdownText sx={{ color: 'text.secondary' }}>
                {card.summary}
              </MarkdownText>
              {isCurrent && (
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="text" onClick={() => setPreviewCard(card)}>
                    Details
                  </Button>
                </Stack>
              )}
            </Stack>
          </Paper>
        ))}
      </Box>
      {isCurrent && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            size="small"
            variant="contained"
            color="success"
            disabled={busy || !canApply}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <Check />}
            onClick={() => onConfirm(message.relatedIssueId, { caseIds: selectedCaseIds })}
          >
            Add selected
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Visibility />}
            disabled={busy || !canApply}
            onClick={() => onIssuePreview && onIssuePreview(
              message.relatedIssueId,
              { caseIds: selectedCaseIds }
            )}
          >
            Preview selected
          </Button>
          {showCancel && (
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<Close />}
              disabled={busy}
              onClick={() => onCancel(message.relatedIssueId)}
            >
              Cancel
            </Button>
          )}
        </Stack>
      )}
      <Dialog open={!!previewCard} onClose={() => setPreviewCard(null)} fullWidth maxWidth="sm">
        <DialogTitle>{previewCard?.title}</DialogTitle>
        <DialogContent dividers>
          <MarkdownText>
            {previewCard?.previewText || previewCard?.insertText || previewCard?.summary}
          </MarkdownText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewCard(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Bubble>
  );
};

const Text = ({ message }) => (
  <Bubble role={message.role}>
    <MarkdownText>{message.content}</MarkdownText>
  </Bubble>
);

const MessageBubble = ({ message, issue, currentIssueId, onConfirm, onCancel, onPreview, onIssuePreview, onSubmit, busy }) => {
  const isCurrent = !!message.relatedIssueId && message.relatedIssueId === currentIssueId;
  switch (message.kind) {
    case 'before-after':
      return <BeforeAfter message={message} issue={issue} onConfirm={onConfirm} onCancel={onCancel} onIssuePreview={onIssuePreview} busy={busy} isCurrent={isCurrent} />;
    case 'choice':
      return <ChoiceMessage message={message} issue={issue} onConfirm={onConfirm} onCancel={onCancel} onIssuePreview={onIssuePreview} busy={busy} isCurrent={isCurrent} />;
    case 'case-cards':
      return <CaseCardsMessage message={message} issue={issue} onConfirm={onConfirm} onCancel={onCancel} onIssuePreview={onIssuePreview} busy={busy} isCurrent={isCurrent} />;
    case 'submission-cta':
      return <SubmissionCta message={message} onPreview={onPreview} onSubmit={onSubmit} busy={busy} />;
    case 'text':
    default:
      return <Text message={message} />;
  }
};

export default MessageBubble;
export { Bubble, MarkdownText };
