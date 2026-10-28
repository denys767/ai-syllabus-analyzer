import React from 'react';
import { Box, Typography } from '@mui/material';
import DiffText from '../diff/DiffText';

// Плейсхолдери рендера стану (backend/services/syllabusState/render.js)
const PLACEHOLDERS = new Set(['—', '[Choose an option]']);
const isPlaceholder = (text) => PLACEHOLDERS.has(String(text || '').trim());

const placeholderSx = { color: 'text.disabled', fontStyle: 'italic' };

// Вміст блоку: parts (diff=1) або текст; плейсхолдер — приглушений курсив
const Content = ({ block, diff }) => {
  if (diff && Array.isArray(block.parts) && block.parts.length) return <DiffText parts={block.parts} />;
  if (isPlaceholder(block.text)) return <Box component="span" sx={placeholderSx}>{block.text}</Box>;
  return <Box component="span" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{block.text}</Box>;
};

// Рядок таблиці «клітинка | клітинка»; у режимі diff — суцільним рядком (parts не діляться на клітинки)
const TableRow = ({ block, diff }) => {
  if (diff && block.parts?.some((p) => p.type !== 'eq')) {
    return <Box sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}><Content block={block} diff /></Box>;
  }
  const cells = String(block.text || '').split(' | ');
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `minmax(120px, 38%) repeat(${Math.max(1, cells.length - 1)}, 1fr)`, gap: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
      {cells.map((cell, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <Box key={i} sx={{ fontWeight: i === 0 ? 600 : 400, ...(isPlaceholder(cell) ? placeholderSx : {}) }}>{cell}</Box>
      ))}
    </Box>
  );
};

// Блоки одного розділу правої панелі: heading | paragraph | list-item | table-row
const DocumentBlocks = ({ blocks = [], diff = false }) => (
  <Box sx={{ typography: 'body2', lineHeight: 1.65 }}>
    {blocks.map((block, i) => {
      // eslint-disable-next-line react/no-array-index-key
      const key = `${block.kind}-${i}`;
      switch (block.kind) {
        case 'heading':
          return <Typography key={key} variant="subtitle2" sx={{ mt: 1.5, mb: 0.5 }}><Content block={block} diff={diff} /></Typography>;
        case 'list-item':
          return (
            <Box key={key} sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
              <Box component="span" sx={{ color: 'text.secondary' }}>•</Box>
              <Box sx={{ minWidth: 0 }}><Content block={block} diff={diff} /></Box>
            </Box>
          );
        case 'table-row':
          return <TableRow key={key} block={block} diff={diff} />;
        default:
          return <Box key={key} sx={{ mb: 1 }}><Content block={block} diff={diff} /></Box>;
      }
    })}
  </Box>
);

export default DocumentBlocks;
