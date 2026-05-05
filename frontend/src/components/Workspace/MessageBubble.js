import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  CircularProgress,
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
  return (
    <Bubble role="ai" sx={{ maxWidth: '95%' }}>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1.5 }}>
        {message.content}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, mb: 1.5 }}>
        <Box sx={{ p: 1.5, bgcolor: 'error.light', color: 'error.contrastText', borderRadius: 1, opacity: 0.95 }}>
          <Typography variant="overline" display="block" sx={{ opacity: 0.85 }}>Before</Typography>
          <Typography variant="body2" sx={{ textDecoration: 'line-through', whiteSpace: 'pre-wrap' }}>
            {before || '(missing section)'}
          </Typography>
        </Box>
        <Box sx={{ p: 1.5, bgcolor: 'success.light', color: 'success.contrastText', borderRadius: 1 }}>
          <Typography variant="overline" display="block" sx={{ opacity: 0.85 }}>After</Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
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
            Skip
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
    case 'submission-cta':
      return <SubmissionCta message={message} onPreview={onPreview} onSubmit={onSubmit} busy={busy} />;
    case 'text':
    default:
      return <Text message={message} />;
  }
};

export default MessageBubble;
export { Bubble };
