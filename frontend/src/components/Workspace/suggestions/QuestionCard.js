import React, { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Send from '@mui/icons-material/Send';
import SuggestionFrame from './SuggestionFrame';
import { S } from '../../../strings';

// kind = 'question': бракує даних, які може дати лише викладач. Після відповіді сервер перетворює
// картку на kind='edit' (чернетка з proposedValues), тож компонент замінюється на DraftCard.
const QuestionCard = ({ suggestion, actions, busy, ...frameProps }) => {
  const [answer, setAnswer] = useState('');
  const pending = suggestion.status === 'pending';
  const trimmed = answer.trim();

  return (
    <SuggestionFrame
      suggestion={suggestion}
      actions={actions}
      busy={busy}
      hideReword
      primary={{
        label: S.sendAnswer,
        icon: <Send />,
        disabled: !trimmed,
        onClick: () => actions.answer(suggestion.id, trimmed),
      }}
      {...frameProps}
    >
      <Box sx={{ p: 1.5, mb: pending ? 1.5 : 0, borderRadius: 1, border: '1px solid', borderColor: 'primary.main', bgcolor: 'action.hover' }}>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{suggestion.question}</Typography>
      </Box>
      {suggestion.answer && !pending && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{S.yourAnswer}: {suggestion.answer}</Typography>
      )}
      {pending && !frameProps.readOnly && (
        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          label={S.yourAnswer}
          value={answer}
          disabled={busy}
          onChange={(e) => setAnswer(e.target.value)}
        />
      )}
    </SuggestionFrame>
  );
};

export default QuestionCard;
