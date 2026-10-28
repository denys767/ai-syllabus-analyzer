import React, { useState } from 'react';
import { Box, Button, Collapse, Stack, Typography } from '@mui/material';
import { HelpOutline, SkipNext } from '@mui/icons-material';
import Bubble from './Bubble';
import MarkdownText from './MarkdownText';
import { S } from '../../../strings';

// Повідомлення kind='question' { slotKey, question, why }: одне питання інтерв'юера за раз.
// Відповідь іде звичайним повідомленням у чат; Skip лишає слот порожнім (його видно ліворуч).
const QuestionMessage = ({ payload, active = false, busy, readOnly, onSkip }) => {
  const [whyOpen, setWhyOpen] = useState(false);
  const [error, setError] = useState('');
  if (!payload?.question) return null;

  const skip = async () => {
    setError('');
    const res = await onSkip(payload.slotKey);
    if (!res?.ok) setError(res?.error || S.errAction);
  };

  return (
    <Bubble role="ai" sx={{ borderColor: active ? 'primary.main' : 'divider' }}>
      <MarkdownText>{payload.question}</MarkdownText>
      {(payload.why || (active && !readOnly)) && (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }} useFlexGap flexWrap="wrap">
          {payload.why && (
            <Button size="small" variant="text" startIcon={<HelpOutline />} onClick={() => setWhyOpen((v) => !v)}>
              {S.whyWeAsk}
            </Button>
          )}
          {active && !readOnly && onSkip && payload.slotKey && (
            <Button size="small" variant="text" color="inherit" startIcon={<SkipNext />} disabled={busy} onClick={skip}>
              {S.skip}
            </Button>
          )}
        </Stack>
      )}
      <Collapse in={whyOpen} unmountOnExit>
        <Box sx={{ mt: 0.5, p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
          <Typography variant="body2" color="text.secondary">{payload.why}</Typography>
        </Box>
      </Collapse>
      {error && <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>{error}</Typography>}
    </Bubble>
  );
};

export default QuestionMessage;
