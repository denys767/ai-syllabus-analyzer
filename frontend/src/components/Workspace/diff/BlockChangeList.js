import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import BlockView from './BlockView';
import DiffText from './DiffText';
import {
  HEAVY_REWRITE_RATIO,
  afterText,
  beforeText,
  blockChangeStatus,
  changeRatio,
} from './diffUtils';
import { BLOCK_KIND_LABELS } from '../constants';

const TonePanel = ({ title, tone, text }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        p: 1.25,
        borderRadius: 1,
        border: '1px solid',
        borderColor: `${tone}.main`,
        bgcolor: alpha(theme.palette[tone].main, dark ? 0.14 : 0.07),
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, color: `${tone}.${dark ? 'light' : 'dark'}` }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mt: 0.25, lineHeight: 1.6 }}>
        {text}
      </Typography>
    </Box>
  );
};

// Для великих переписувань inline-diff перетворюється на «кісель», тому показуємо «було / стало».
const BeforeAfterStack = ({ change, parts }) => {
  const label = BLOCK_KIND_LABELS[change.kind];
  return (
    <Stack spacing={0.75}>
      {label && <Typography variant="caption" color="text.secondary">{label}</Typography>}
      <TonePanel title="Було" tone="error" text={change.before ?? beforeText(parts)} />
      <TonePanel title="Стало" tone="success" text={change.after ?? afterText(parts)} />
    </Stack>
  );
};

export const BlockChangeItem = ({ change }) => {
  const status = blockChangeStatus(change);
  let parts = change.parts;
  if (!parts || !parts.length) {
    parts = status === 'deleted'
      ? [{ type: 'del', text: change.before || '' }]
      : [{ type: 'ins', text: change.after || '' }];
  }
  if (status === 'changed' && changeRatio(parts) > HEAVY_REWRITE_RATIO) {
    return <BeforeAfterStack change={change} parts={parts} />;
  }
  return <BlockView kind={change.kind} status={status} parts={parts} />;
};

const BlockChangeList = ({ changes, emptyText = 'Змін немає.' }) => {
  if (!changes || !changes.length) {
    return <Typography variant="body2" color="text.secondary">{emptyText}</Typography>;
  }
  return (
    <Stack spacing={1}>
      {changes.map((change, index) => (
        // blockId може повторюватися (кілька вставок після одного блоку)
        <BlockChangeItem key={`${change.blockId}-${index}`} change={change} />
      ))}
    </Stack>
  );
};

export { DiffText };
export default BlockChangeList;
