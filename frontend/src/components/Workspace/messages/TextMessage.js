import React from 'react';
import Typography from '@mui/material/Typography';
import Bubble from './Bubble';
import MarkdownText from './MarkdownText';

// Повідомлення викладача — простий текст; відповіді AI — markdown.
const TextMessage = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <Bubble role={message.role}>
      {isUser ? (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {message.content}
        </Typography>
      ) : (
        <MarkdownText>{message.content}</MarkdownText>
      )}
    </Bubble>
  );
};

export default TextMessage;
