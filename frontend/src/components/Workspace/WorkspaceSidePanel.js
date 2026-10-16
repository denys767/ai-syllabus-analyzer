import React from 'react';
import { Box, Button, CircularProgress, Divider, Stack, Typography } from '@mui/material';
import { Description, PictureAsPdf, Send, Slideshow, Visibility } from '@mui/icons-material';
import ReadinessSummary from './ReadinessSummary';
import SuggestionsList from './SuggestionsList';
import { outputsForFormat } from '../../utils/download';

const fileIcon = (name) => {
  if (name.endsWith('.pdf')) return <PictureAsPdf />;
  if (name.endsWith('.pptx')) return <Slideshow />;
  return <Description />;
};

const Section = ({ title, children }) => (
  <Box sx={{ p: 2 }}>
    {title && <Typography variant="subtitle2" sx={{ mb: 1 }}>{title}</Typography>}
    {children}
  </Box>
);

// Права панель: готовність, список пропозицій, файли та надсилання. Лише презентація.
const WorkspaceSidePanel = ({
  readiness,
  suggestions,
  outputs,
  filesEnabled,
  downloading,
  canSubmit,
  submitted,
  readOnly,
  busy,
  pendingCount,
  onSelectSuggestion,
  onDownload,
  onPreviewDocument,
  onSubmit,
}) => (
  <Box
    sx={{
      width: 340,
      maxWidth: '100%',
      flexShrink: 0,
      height: '100%',
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column',
      bgcolor: 'background.paper',
    }}
  >
    <Section><ReadinessSummary readiness={readiness} /></Section>
    <Divider />
    <Section title="Пропозиції">
      <SuggestionsList suggestions={suggestions} onSelect={onSelectSuggestion} />
    </Section>
    <Divider />
    <Section title="Документ">
      <Stack spacing={1}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Visibility />}
          disabled={!filesEnabled}
          onClick={onPreviewDocument}
        >
          Переглянути документ
        </Button>
        {(outputs || outputsForFormat()).map((file) => (
          <Button
            key={file.name}
            size="small"
            variant="outlined"
            startIcon={downloading === file.name ? <CircularProgress size={16} /> : fileIcon(file.name)}
            disabled={!filesEnabled || !!downloading}
            onClick={() => onDownload(file.name)}
            sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
          >
            {file.label}
          </Button>
        ))}
      </Stack>
    </Section>
    <Divider />
    <Section>
      <Button
        fullWidth
        variant="contained"
        startIcon={<Send />}
        disabled={!canSubmit || busy || submitted}
        onClick={onSubmit}
      >
        {submitted ? 'Надіслано директору' : 'Надіслати директору'}
      </Button>
      {!submitted && !readOnly && pendingCount > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          Спершу опрацюйте всі пропозиції (залишилось {pendingCount}).
        </Typography>
      )}
    </Section>
  </Box>
);

export default WorkspaceSidePanel;
