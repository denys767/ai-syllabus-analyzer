import React, { useState } from 'react';
import { Box, TextField, Typography } from '@mui/material';
import { Send } from '@mui/icons-material';
import SuggestionFrame from './SuggestionFrame';

// kind = 'question': AI просить дані, яких бракує в тексті. Після відповіді сервер перетворює
// картку на kind='edit', тож компонент замінюється на SuggestionCard.
const QuestionCard = ({ suggestion, actions, busy, ...frameProps }) => {
  const [answer, setAnswer] = useState('');
  const pending = suggestion.status === 'pending';
  const trimmed = answer.trim();

  return (
    <SuggestionFrame
      suggestion={suggestion}
      actions={actions}
      busy={busy}
      hideRefine
      primary={{
        label: busy ? 'Генеруємо правку…' : 'Надіслати відповідь',
        icon: <Send />,
        disabled: !trimmed,
        onClick: () => actions.answer(suggestion.id, trimmed),
      }}
      {...frameProps}
    >
      <Box
        sx={{
          p: 1.5,
          mb: pending ? 1.5 : 0,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'info.main',
          bgcolor: 'action.hover',
        }}
      >
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{suggestion.question}</Typography>
      </Box>
      {pending && !frameProps.readOnly && (
        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          label="Ваша відповідь"
          value={answer}
          disabled={busy}
          onChange={(e) => setAnswer(e.target.value)}
        />
      )}
    </SuggestionFrame>
  );
};

export default QuestionCard;
