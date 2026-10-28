import React, { useEffect, useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  LinearProgress,
  Paper,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { Download } from '@mui/icons-material';
import DocumentBlocks from './document/DocumentBlocks';
import { S } from '../../strings';

// Права зона: живий документ (GET /chat/:id/document), тумблер Diff проти baselineState і головна кнопка Download .docx.
// Документ перечитується на кожну нову ревізію стану (useWorkspace); завантаження доступне на будь-якому етапі.
const LiveDocumentPanel = ({
  document,
  templateSections = [],
  diff = false,
  onToggleDiff,
  onDownload,
  downloading = false,
  canDownload = true,
  focusedKey = null,
}) => {
  const scrollRef = useRef(null);
  const sections = document?.sections;
  const titles = new Map(templateSections.map((s) => [s.key, s]));

  // Стрибок у розділ: прокручуємо лише власний контейнер панелі
  useEffect(() => {
    if (!focusedKey || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-section="${focusedKey}"]`);
    if (el) scrollRef.current.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
  }, [focusedKey, sections]);

  let lastDocNumber = null;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', minWidth: 0 }}>
      <Box sx={{ p: 1.5, px: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap">
          <Typography variant="subtitle2">{S.document}</Typography>
          <FormControlLabel
            sx={{ mr: 0 }}
            control={<Switch size="small" checked={diff} onChange={(e) => onToggleDiff?.(e.target.checked)} />}
            label={<Typography variant="body2">{S.showChanges}</Typography>}
          />
        </Stack>
        <Button
          fullWidth
          variant="contained"
          startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <Download />}
          disabled={!canDownload || downloading}
          onClick={onDownload}
          sx={{ mt: 1 }}
        >
          {downloading ? S.downloading : S.downloadDocx}
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, textAlign: 'center' }}>
          {S.documentHint}
        </Typography>
      </Box>
      {document?.loading && <LinearProgress sx={{ height: 2 }} />}
      <Box ref={scrollRef} sx={{ flexGrow: 1, overflow: 'auto', p: 2, position: 'relative' }}>
        {document?.error && <Alert severity="error" sx={{ mb: 2 }}>{document.error}</Alert>}
        {!sections && !document?.error && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={24} /></Box>
        )}
        {sections && (
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            {sections.map((sec) => {
              const meta = titles.get(sec.key);
              const docTitle = meta?.docTitle;
              // Підрозділи одного пункту шаблону (1 Summary → кілька розділів) отримують спільний заголовок
              const groupHeading = sec.docNumber && sec.docNumber !== lastDocNumber && docTitle && docTitle !== sec.title
                ? `${sec.docNumber}. ${docTitle}` : null;
              const ownHeading = groupHeading
                ? sec.title
                : sec.docNumber && sec.docNumber !== lastDocNumber ? `${sec.docNumber}. ${sec.title}` : sec.title;
              lastDocNumber = sec.docNumber ?? lastDocNumber;
              const focused = focusedKey === sec.key;
              return (
                <Box
                  key={sec.key}
                  data-section={sec.key}
                  sx={{
                    mb: 2.5,
                    pl: 1.5,
                    ml: -1.5,
                    borderLeft: '3px solid',
                    borderColor: focused ? 'primary.main' : 'transparent',
                    transition: 'border-color 0.3s',
                  }}
                >
                  {groupHeading && <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>{groupHeading}</Typography>}
                  <Typography variant={groupHeading || !sec.docNumber ? 'subtitle1' : 'h6'} sx={{ fontWeight: 600, mb: 0.75 }}>
                    {ownHeading}
                  </Typography>
                  {sec.blocks?.length
                    ? <DocumentBlocks blocks={sec.blocks} diff={diff} />
                    : <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>Not filled in yet</Typography>}
                </Box>
              );
            })}
            {!sections.length && <Typography variant="body2" color="text.secondary">{S.documentEmpty}</Typography>}
          </Paper>
        )}
      </Box>
    </Box>
  );
};

export default LiveDocumentPanel;
