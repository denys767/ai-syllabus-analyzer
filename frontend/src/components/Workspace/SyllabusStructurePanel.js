import React from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  LinearProgress,
  List,
  ListItemButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { CheckCircle, EditNote, RadioButtonUnchecked } from '@mui/icons-material';
import { S, SECTION_STATUS, SEVERITY, sectionsApproved } from '../../strings';

const STATUS_ICON = {
  approved: <CheckCircle fontSize="small" color="primary" />,
  draft: <EditNote fontSize="small" color="warning" />,
  empty: <RadioButtonUnchecked fontSize="small" color="disabled" />,
};

const sectionLabel = (sec) => (sec.docNumber ? `${sec.docNumber} · ${sec.title}` : sec.title);

// Позначки непройдених перевірок розділу: critical / high / інші
const CheckBadges = ({ checks }) => {
  if (!checks) return null;
  const items = [
    { key: 'critical', n: checks.critical, color: 'error', label: SEVERITY.critical.label },
    { key: 'high', n: checks.high, color: 'warning', label: SEVERITY.high.label },
    { key: 'other', n: checks.other, color: 'default', label: 'Other' },
  ].filter((x) => x.n > 0);
  return (
    <Stack direction="row" spacing={0.5}>
      {items.map((x) => (
        <Tooltip key={x.key} title={`${x.n} open ${x.label.toLowerCase()} check${x.n === 1 ? '' : 's'}`}>
          <Chip size="small" color={x.color} variant={x.color === 'default' ? 'outlined' : 'filled'} label={x.n} sx={{ height: 20, minWidth: 24, '& .MuiChip-label': { px: 0.75 } }} />
        </Tooltip>
      ))}
    </Stack>
  );
};

// Ліва зона: розділи шаблону зі статусом empty/draft/approved, «N of M sections approved», позначки перевірок.
// Клік — стрибок у розділ (документ і чат); у вибраному розділі — прогалини, перевірки і Approve/Unapprove.
const SyllabusStructurePanel = ({
  sections = [],
  readiness,
  checks = [],
  suggestions = [],
  focusedKey = null,
  onSelect,
  actions,
  busy = false,
  readOnly = false,
}) => {
  const counts = readiness?.counts || { approved: 0, required: sections.filter((s) => s.required !== false).length, pendingSuggestions: 0 };
  const score = Math.max(0, Math.min(100, Math.round(readiness?.score ?? 0)));
  const [error, setError] = React.useState('');

  const exec = async (fn) => {
    setError('');
    const res = await fn();
    if (!res?.ok) setError(res?.error || S.errAction);
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto', bgcolor: 'background.paper' }}>
      <Box sx={{ p: 2, pb: 1.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
          <Typography variant="subtitle2">{S.readiness}</Typography>
          <Typography variant="subtitle2" color="primary">{score}%</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={score} sx={{ height: 8, borderRadius: 4 }} aria-label={S.readiness} />
        <Typography variant="body2" sx={{ mt: 1 }}>{sectionsApproved(counts.approved, counts.required)}</Typography>
        {counts.pendingSuggestions > 0 && (
          <Typography variant="caption" color="text.secondary">{S.pendingDrafts(counts.pendingSuggestions)}</Typography>
        )}
      </Box>

      <List dense disablePadding sx={{ pb: 2 }}>
        {sections.map((sec) => {
          const info = readiness?.sections?.[sec.key] || {};
          const status = info.status || 'empty';
          const selected = focusedKey === sec.key;
          const skipped = Array.isArray(info.skipped) ? info.skipped.length : Number(info.skipped || 0);
          const pending = suggestions.filter((s) => s.status === 'pending' && (s.section || s.target?.section) === sec.key).length;
          const failed = checks.filter((c) => c.section === sec.key && c.passed === false);
          return (
            <Box key={sec.key}>
              <ListItemButton
                selected={selected}
                onClick={() => onSelect?.(selected ? null : sec.key)}
                sx={{ alignItems: 'flex-start', py: 0.75, mx: 1 }}
              >
                <Box sx={{ mt: 0.25, mr: 1.25, display: 'flex' }}>
                  <Tooltip title={SECTION_STATUS[status]}>{STATUS_ICON[status] || STATUS_ICON.empty}</Tooltip>
                </Box>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: selected ? 600 : 500, lineHeight: 1.35 }}>{sectionLabel(sec)}</Typography>
                  <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 0.25 }}>
                    <Typography variant="caption" color="text.secondary">{SECTION_STATUS[status]}</Typography>
                    {pending > 0 && <Typography variant="caption" color="warning.main">· {S.pendingDrafts(pending)}</Typography>}
                    {skipped > 0 && <Chip size="small" variant="outlined" label={S.skipped} sx={{ height: 18, fontSize: 11 }} />}
                  </Stack>
                </Box>
                <CheckBadges checks={info.checks} />
              </ListItemButton>
              <Collapse in={selected} unmountOnExit>
                <Box sx={{ px: 3, pb: 1.5, pt: 0.5, ml: 3 }}>
                  {info.gaps?.length > 0 && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{S.gaps}</Typography>
                      {info.gaps.map((g) => <Typography key={g} variant="caption" component="div">• {g}</Typography>)}
                    </Box>
                  )}
                  {failed.length > 0 && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{S.openIssues}</Typography>
                      {failed.map((c) => (
                        <Typography key={c.id} variant="caption" component="div" sx={{ color: c.severity === 'critical' ? 'error.main' : c.severity === 'high' ? 'warning.main' : 'text.primary' }}>
                          • {c.message}
                        </Typography>
                      ))}
                    </Box>
                  )}
                  {!readOnly && (info.approved ? (
                    <Button size="small" variant="text" disabled={busy} onClick={() => exec(() => actions.unapproveSection(sec.key))}>{S.unapprove}</Button>
                  ) : (
                    <Tooltip title={info.complete === false ? `${S.gaps}: ${(info.gaps || []).join('; ')}` : ''}>
                      <span>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<CheckCircle />}
                          disabled={busy || info.complete === false}
                          onClick={() => exec(() => actions.approveSection(sec.key))}
                        >
                          {S.approve}
                        </Button>
                      </span>
                    </Tooltip>
                  ))}
                  {error && selected && <Typography variant="caption" color="error" component="div" sx={{ mt: 0.5 }}>{error}</Typography>}
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </List>
    </Box>
  );
};

export default SyllabusStructurePanel;
