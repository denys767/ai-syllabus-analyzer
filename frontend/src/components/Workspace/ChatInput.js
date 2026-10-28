import React, { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import { S } from '../../strings';
import Send from '@mui/icons-material/Send';

const ChatInput = ({ onSend, disabled, placeholder }) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      // onSend повертає false при помилці — тоді текст лишається в полі.
      const ok = await onSend(trimmed);
      if (ok !== false) setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1, bgcolor: 'background.paper' }}>
      <TextField
        fullWidth
        size="small"
        multiline
        maxRows={4}
        placeholder={placeholder || S.chatPlaceholder}
        value={text}
        disabled={disabled || sending}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <IconButton color="primary" aria-label={S.send} onClick={submit} disabled={disabled || sending || !text.trim()}>
        {sending ? <CircularProgress size={20} /> : <Send />}
      </IconButton>
    </Box>
  );
};

export default ChatInput;
