import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';

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
          borderRadius: '16px',
          ...sx,
        }}
      >
        {children}
      </Paper>
    </Box>
  );
};

export default Bubble;
