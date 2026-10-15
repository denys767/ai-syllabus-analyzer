import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import TextMessage from './TextMessage';
import SubmissionCta from './SubmissionCta';
import SuggestionCard from '../suggestions/SuggestionCard';
import ChoiceCard from '../suggestions/ChoiceCard';
import QuestionCard from '../suggestions/QuestionCard';
import { STATUS_LABELS } from '../constants';

// Одна картка на kind пропозиції; повідомлення містить лише id пропозиції.
const SUGGESTION_CARDS = {
  edit: SuggestionCard,
  choice: ChoiceCard,
  question: QuestionCard,
};

// Якщо пропозиція вже показана нижче в стрічці (наприклад, після Reopen), старе місце — компактне посилання.
const SuggestionReference = ({ suggestion, onSelect }) => (
  <Box
    onClick={() => onSelect?.(suggestion.id)}
    sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1.5, cursor: 'pointer', color: 'text.secondary' }}
  >
    <Chip size="small" variant="outlined" label={STATUS_LABELS[suggestion.status] || suggestion.status} />
    <Typography variant="body2" sx={{ textDecoration: 'underline' }}>{suggestion.title}</Typography>
  </Box>
);

const MessageItem = ({
  message,
  suggestion,
  isLatestForSuggestion = true,
  actions,
  busy,
  readOnly,
  highlightedId,
  pendingCount,
  submitted,
  onPreviewDocument,
  onSubmit,
  onSelectSuggestion,
}) => {
  switch (message.kind) {
    case 'text':
      return <TextMessage message={message} />;
    case 'suggestion': {
      if (!suggestion) return null;
      if (!isLatestForSuggestion) {
        return <SuggestionReference suggestion={suggestion} onSelect={onSelectSuggestion} />;
      }
      const Card = SUGGESTION_CARDS[suggestion.kind];
      if (!Card) return null;
      return (
        <Card
          suggestion={suggestion}
          actions={actions}
          busy={busy}
          readOnly={readOnly}
          highlighted={highlightedId === suggestion.id}
        />
      );
    }
    case 'submission-cta':
      return (
        <SubmissionCta
          message={message}
          pendingCount={pendingCount}
          submitted={submitted}
          readOnly={readOnly}
          busy={busy}
          onPreview={onPreviewDocument}
          onSubmit={onSubmit}
        />
      );
    default:
      return null;
  }
};

export default MessageItem;
