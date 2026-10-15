import React from 'react';
import { Box, Button, CircularProgress, Divider, Stack, Typography } from '@mui/material';
import { Description, PictureAsPdf, Send, Visibility } from '@mui/icons-material';
import ReadinessSummary from './ReadinessSummary';
import SuggestionsList from './SuggestionsList';
import { OUTPUT_FILES } from '../../utils/download';

const FILE_ICONS = { 'tracked.pdf': <PictureAsPdf /> };

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
  filesEnabled,
  downloading,
  canSubmit,
  submitted,
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
        {OUTPUT_FILES.map((file) => (
          <Button
            key={file.name}
            size="small"
            variant="outlined"
            startIcon={downloading === file.name ? <CircularProgress size={16} /> : (FILE_ICONS[file.name] || <Description />)}
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
      {!submitted && pendingCount > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          Спершу опрацюйте всі пропозиції (залишилось {pendingCount}).
        </Typography>
      )}
    </Section>
  </Box>
);

export default WorkspaceSidePanel;
