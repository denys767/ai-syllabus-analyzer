import React, { useEffect, useState } from 'react';
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
import { Check, Close, Visibility, Send, Replay } from '@mui/icons-material';

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
    <Box sx={{ maxWidth: '100%', overflowX: 'auto', my: 1 }}>
      <Box
        component="table"
        sx={{
          width: '100%',
          minWidth: 420,
          borderCollapse: 'collapse',
          fontSize: '0.875rem',
        }}
      >
        {children}
      </Box>
    </Box>
  ),
  thead: ({ children }) => <Box component="thead" sx={{ bgcolor: 'action.hover' }}>{children}</Box>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <Box component="th" sx={{ border: '1px solid', borderColor: 'divider', p: 0.75, textAlign: 'left', fontWeight: 700 }}>
      {children}
    </Box>
  ),
  td: ({ children }) => (
    <Box component="td" sx={{ border: '1px solid', borderColor: 'divider', p: 0.75, verticalAlign: 'top' }}>
      {children}
    </Box>
  ),
};

function looksLikeTableRow(line) {
  const trimmed = String(line || '').trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 4;
}

function looksLikeTableDivider(line) {
  const trimmed = String(line || '').trim();
  if (!looksLikeTableRow(trimmed)) return false;
  return trimmed
    .slice(1, -1)
    .split('|')
    .every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function normalizeMarkdownTables(value) {
  const lines = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const startsTable = looksLikeTableRow(line) && looksLikeTableDivider(lines[index + 1]);
    if (startsTable && out.length && out[out.length - 1].trim()) {
      out.push('');
    }
    out.push(line);
    const inTable = looksLikeTableRow(line) || looksLikeTableDivider(line);
    const nextLeavesTable = inTable && lines[index + 1] && !looksLikeTableRow(lines[index + 1]) && lines[index + 1].trim();
    if (nextLeavesTable) {
      out.push('');
    }
  }
  return out.join('\n');
}

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
      '& table': {
        tableLayout: 'auto',
      },
      ...sx,
    }}
  >
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {normalizeMarkdownTables(children)}
    </ReactMarkdown>
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

const CATEGORY_LABELS = {
  'template-compliance': 'Template Compliance',
  'learning-objectives': 'Learning Outcomes Alignment',
  'content-quality': 'Content Quality',
  cases: 'Case Recommendations',
  'student-clusters': 'Student Cluster Fit',
  plagiarism: 'Plagiarism',
  policy: 'Course Policies',
  other: 'Other',
};

function categoryLabel(issue, message) {
  return issue?.groupTag
    || message.payload?.groupTag
    || CATEGORY_LABELS[issue?.category || message.payload?.category]
    || null;
}

const CategoryChip = ({ issue, message }) => {
  const label = categoryLabel(issue, message);
  if (!label) return null;
  return <Chip size="small" variant="outlined" label={label} sx={{ mb: 1 }} />;
};

const ResolvedActions = ({ message, onIssuePreview, onReopen, busy }) => (
  <Stack direction="row" spacing={1}>
    <Button
      size="small"
      variant="outlined"
      startIcon={<Visibility />}
      disabled={busy}
      onClick={() => onIssuePreview && onIssuePreview(message.relatedIssueId)}
    >
      Preview
    </Button>
    <Button
      size="small"
      variant="outlined"
      startIcon={<Replay />}
      disabled={busy}
      onClick={() => onReopen && onReopen(message.relatedIssueId, message._id)}
    >
      Reopen
    </Button>
  </Stack>
);

const BeforeAfter = ({ message, issue, onConfirm, onCancel, onReopen, onIssuePreview, busy, isCurrent, isResolved }) => {
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
  const beforePanelSx = (theme) => ({
    ...panelSx,
    bgcolor: theme.palette.mode === 'dark' ? 'rgba(244, 67, 54, 0.14)' : '#fff5f5',
    borderColor: theme.palette.mode === 'dark' ? 'error.dark' : 'error.light',
  });
  const afterPanelSx = (theme) => ({
    ...panelSx,
    bgcolor: theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.16)' : '#f0fff4',
    borderColor: theme.palette.mode === 'dark' ? 'success.dark' : 'success.light',
  });
  const beforeLabelSx = (theme) => ({
    color: theme.palette.mode === 'dark' ? 'error.light' : 'error.dark',
    fontWeight: 700,
  });
  const afterLabelSx = (theme) => ({
    color: theme.palette.mode === 'dark' ? 'success.light' : 'success.dark',
    fontWeight: 700,
  });

  return (
    <Bubble role="ai" sx={{ maxWidth: '95%' }}>
      <CategoryChip issue={issue} message={message} />
      <MarkdownText sx={{ mb: 1.5 }}>{message.content}</MarkdownText>
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
                <Typography variant="overline" display="block" sx={beforeLabelSx}>
                  Before
                </Typography>
                <MarkdownText sx={{ color: 'text.primary' }}>
                  {beforeParts[index] || '(missing section)'}
                </MarkdownText>
              </Box>
              <Box sx={afterPanelSx}>
                <Typography variant="overline" display="block" sx={afterLabelSx}>
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
        </Stack>
      )}
      {isResolved && (
        <ResolvedActions message={message} onIssuePreview={onIssuePreview} onReopen={onReopen} busy={busy} />
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

const ChoiceMessage = ({ message, issue, onConfirm, onCancel, onReopen, onIssuePreview, busy, isCurrent, isResolved }) => {
  const options = message.payload?.options || [];
  const storedSelection = issue?.beforeAfter?.payload?.appliedSelection || message.payload?.appliedSelection || {};
  const storedOptionId = storedSelection.optionId || options[0]?.id || '';
  const [optionId, setOptionId] = useState(storedOptionId);
  const [customNote, setCustomNote] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const effectiveOptionId = isCurrent ? optionId : storedOptionId;
  const canApply = customMode ? customText.trim().length > 0 : !!effectiveOptionId;
  useEffect(() => {
    setOptionId(storedOptionId);
  }, [storedOptionId]);
  useEffect(() => {
    if (!isCurrent) setCustomMode(false);
  }, [isCurrent]);

  return (
    <Bubble role="ai" sx={{ maxWidth: '95%' }}>
      <CategoryChip issue={issue} message={message} />
      <MarkdownText sx={{ mb: 1.5 }}>{message.content}</MarkdownText>
      {!customMode ? (
        <RadioGroup value={effectiveOptionId} onChange={(event) => isCurrent && setOptionId(event.target.value)}>
          <Stack spacing={1}>
            {options.map((option) => (
              <Paper key={option.id} variant="outlined" sx={{ p: 1.25, borderRadius: 1 }}>
                <FormControlLabel
                  value={option.id}
                  control={<Radio size="small" disabled={!isCurrent || busy} />}
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
          disabled={!isCurrent || busy}
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
          disabled={!isCurrent || busy}
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
              customMode ? { customText: customText.trim() } : { optionId: effectiveOptionId, customNote: customNote.trim() }
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
            disabled={busy || customMode || !effectiveOptionId}
            onClick={() => onIssuePreview && onIssuePreview(
              message.relatedIssueId,
              { optionId: effectiveOptionId, customNote: customNote.trim() }
            )}
          >
            Preview
          </Button>
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
        </Stack>
      )}
      {isResolved && (
        <ResolvedActions message={message} onIssuePreview={onIssuePreview} onReopen={onReopen} busy={busy} />
      )}
    </Bubble>
  );
};

const CaseCardsMessage = ({ message, issue, onConfirm, onCancel, onReopen, onIssuePreview, busy, isCurrent, isResolved }) => {
  const cards = message.payload?.cards || [];
  const [previewCard, setPreviewCard] = useState(null);
  const storedSelection = issue?.beforeAfter?.payload?.appliedSelection || message.payload?.appliedSelection || {};
  const storedCaseIds = Array.isArray(storedSelection.caseIds) && storedSelection.caseIds.length
    ? storedSelection.caseIds
    : [storedSelection.caseId || cards[0]?.id].filter(Boolean);
  const [selectedCaseIds, setSelectedCaseIds] = useState(() => storedCaseIds);
  const storedCaseKey = JSON.stringify(storedCaseIds.map(String));
  const effectiveCaseIds = isCurrent ? selectedCaseIds : storedCaseIds;
  useEffect(() => {
    setSelectedCaseIds(JSON.parse(storedCaseKey));
  }, [storedCaseKey]);
  const toggleCase = (id) => {
    setSelectedCaseIds((current) => (
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    ));
  };
  const canApply = effectiveCaseIds.length > 0;

  return (
    <Bubble role="ai" sx={{ maxWidth: '95%' }}>
      <CategoryChip issue={issue} message={message} />
      <MarkdownText sx={{ mb: 1.5 }}>{message.content}</MarkdownText>
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
                    checked={effectiveCaseIds.includes(card.id)}
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
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="text" onClick={() => setPreviewCard(card)}>
                  Details
                </Button>
              </Stack>
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
            onClick={() => onConfirm(message.relatedIssueId, { caseIds: effectiveCaseIds })}
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
              { caseIds: effectiveCaseIds }
            )}
          >
            Preview selected
          </Button>
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
        </Stack>
      )}
      {isResolved && (
        <ResolvedActions message={message} onIssuePreview={onIssuePreview} onReopen={onReopen} busy={busy} />
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

const MessageBubble = ({ message, issue, currentIssueId, onConfirm, onCancel, onReopen, onPreview, onIssuePreview, onSubmit, busy }) => {
  const isCurrent = !!message.relatedIssueId && message.relatedIssueId === currentIssueId;
  const isResolved = !!message.relatedIssueId && !!issue?.decision && issue.decision !== 'pending';
  switch (message.kind) {
    case 'before-after':
      return <BeforeAfter message={message} issue={issue} onConfirm={onConfirm} onCancel={onCancel} onReopen={onReopen} onIssuePreview={onIssuePreview} busy={busy} isCurrent={isCurrent} isResolved={isResolved} />;
    case 'choice':
      return <ChoiceMessage message={message} issue={issue} onConfirm={onConfirm} onCancel={onCancel} onReopen={onReopen} onIssuePreview={onIssuePreview} busy={busy} isCurrent={isCurrent} isResolved={isResolved} />;
    case 'case-cards':
      return <CaseCardsMessage message={message} issue={issue} onConfirm={onConfirm} onCancel={onCancel} onReopen={onReopen} onIssuePreview={onIssuePreview} busy={busy} isCurrent={isCurrent} isResolved={isResolved} />;
    case 'submission-cta':
      return <SubmissionCta message={message} onPreview={onPreview} onSubmit={onSubmit} busy={busy} />;
    case 'text':
    default:
      return <Text message={message} />;
  }
};

export default MessageBubble;
export { Bubble, MarkdownText };
