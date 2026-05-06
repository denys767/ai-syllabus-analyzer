import React, { useState } from 'react';
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

const BeforeAfter = ({ message, onConfirm, onCancel, busy, isCurrent }) => {
  const before = message.payload?.before;
  const after = message.payload?.after;
  const panelSx = {
    p: 1.5,
    borderRadius: 1,
    border: '1px solid',
  };

  return (
    <Bubble role="ai" sx={{ maxWidth: '95%' }}>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1.5 }}>
        {message.content}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, mb: 1.5 }}>
        <Box sx={{ ...panelSx, bgcolor: '#fff5f5', borderColor: 'error.light' }}>
          <Typography variant="overline" display="block" sx={{ color: 'error.dark', fontWeight: 700 }}>
            Before
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.primary',
              whiteSpace: 'pre-wrap',
            }}
          >
            {before || '(missing section)'}
          </Typography>
        </Box>
        <Box sx={{ ...panelSx, bgcolor: '#f0fff4', borderColor: 'success.light' }}>
          <Typography variant="overline" display="block" sx={{ color: 'success.dark', fontWeight: 700 }}>
            After
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.primary',
              whiteSpace: 'pre-wrap',
            }}
          >
            {after}
          </Typography>
        </Box>
      </Box>
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
            color="inherit"
            startIcon={<Close />}
            disabled={busy}
            onClick={() => onCancel(message.relatedIssueId)}
          >
            Cancel
          </Button>
        </Stack>
      )}
    </Bubble>
  );
};

const SubmissionCta = ({ message, onPreview, onSubmit, busy }) => (
  <Bubble role="ai">
    <Typography variant="body2" sx={{ mb: 1.5 }}>
      {message.content}
    </Typography>
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

const ChoiceMessage = ({ message, onConfirm, onCancel, busy, isCurrent }) => {
  const options = message.payload?.options || [];
  const [optionId, setOptionId] = useState(options[0]?.id || '');
  const [customNote, setCustomNote] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const canApply = customMode ? customText.trim().length > 0 : !!optionId;

  return (
    <Bubble role="ai" sx={{ maxWidth: '95%' }}>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1.5 }}>
        {message.content}
      </Typography>
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
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'text.secondary' }}>
                        {option.text}
                      </Typography>
                      {option.rationale && (
                        <Typography variant="caption" color="text.secondary">
                          {option.rationale}
                        </Typography>
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
            color="inherit"
            startIcon={<Close />}
            disabled={busy}
            onClick={() => onCancel(message.relatedIssueId)}
          >
            Cancel
          </Button>
        </Stack>
      )}
    </Bubble>
  );
};

const CaseCardsMessage = ({ message, onConfirm, onCancel, busy, isCurrent }) => {
  const cards = message.payload?.cards || [];
  const [previewCard, setPreviewCard] = useState(null);

  return (
    <Bubble role="ai" sx={{ maxWidth: '95%' }}>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1.5 }}>
        {message.content}
      </Typography>
      {message.payload?.week && (
        <Chip size="small" label={`Case Recommendations - ${message.payload.week}`} sx={{ mb: 1.5 }} />
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25, mb: 1.5 }}>
        {cards.map((card) => (
          <Paper key={card.id} variant="outlined" sx={{ p: 1.25, borderRadius: 1 }}>
            <Stack spacing={0.75}>
              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                <Typography variant="subtitle2">{card.title}</Typography>
                {card.fitLabel && <Chip size="small" color="success" label={card.fitLabel} />}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {card.sourceUrl ? (
                  <Link href={card.sourceUrl} target="_blank" rel="noreferrer">
                    {card.sourceLabel || card.sourceUrl}
                  </Link>
                ) : (card.sourceLabel || 'Source not provided')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {card.summary}
              </Typography>
              {isCurrent && (
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" onClick={() => setPreviewCard(card)}>
                    Preview
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    disabled={busy}
                    startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <Check />}
                    onClick={() => onConfirm(message.relatedIssueId, { caseId: card.id })}
                  >
                    Add
                  </Button>
                </Stack>
              )}
            </Stack>
          </Paper>
        ))}
      </Box>
      {isCurrent && (
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
      <Dialog open={!!previewCard} onClose={() => setPreviewCard(null)} fullWidth maxWidth="sm">
        <DialogTitle>{previewCard?.title}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {previewCard?.previewText || previewCard?.insertText || previewCard?.summary}
          </Typography>
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
    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{message.content}</Typography>
  </Bubble>
);

const MessageBubble = ({ message, currentIssueId, onConfirm, onCancel, onPreview, onSubmit, busy }) => {
  const isCurrent = !!message.relatedIssueId && message.relatedIssueId === currentIssueId;
  switch (message.kind) {
    case 'before-after':
      return <BeforeAfter message={message} onConfirm={onConfirm} onCancel={onCancel} busy={busy} isCurrent={isCurrent} />;
    case 'choice':
      return <ChoiceMessage message={message} onConfirm={onConfirm} onCancel={onCancel} busy={busy} isCurrent={isCurrent} />;
    case 'case-cards':
      return <CaseCardsMessage message={message} onConfirm={onConfirm} onCancel={onCancel} busy={busy} isCurrent={isCurrent} />;
    case 'submission-cta':
      return <SubmissionCta message={message} onPreview={onPreview} onSubmit={onSubmit} busy={busy} />;
    case 'text':
    default:
      return <Text message={message} />;
  }
};

export default MessageBubble;
export { Bubble };
