import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { Check, Close, Edit, ExpandLess, ExpandMore, Replay, WarningAmber } from '@mui/icons-material';
import RejectDialog from './RejectDialog';
import RefineDialog from './RefineDialog';
import ConflictDialog from './ConflictDialog';
import { GROUP_LABELS, REJECT_TAGS, SEVERITY } from '../constants';

const tagLabel = (value) => REJECT_TAGS.find((t) => t.value === value)?.label || null;

const ResolvedSummary = ({ suggestion }) => {
  const accepted = suggestion.status === 'accepted';
  const selected = suggestion.options?.find((o) => o.id === suggestion.selectedOptionId);
  const tag = tagLabel(suggestion.rejectTag);
  return (
    <Stack spacing={0.5} sx={{ mb: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
        <Chip
          size="small"
          color={accepted ? 'success' : 'default'}
          icon={accepted ? <Check /> : <Close />}
          label={accepted ? 'Прийнято' : 'Відхилено'}
        />
        {accepted && selected && (
          <Typography variant="caption" color="text.secondary">Обраний варіант: {selected.label}</Typography>
        )}
        {!accepted && tag && <Chip size="small" variant="outlined" label={tag} />}
      </Stack>
      {suggestion.decisionReason && (
        <Typography variant="body2" color="text.secondary">Причина: {suggestion.decisionReason}</Typography>
      )}
    </Stack>
  );
};

// Спільна оболонка картки пропозиції: заголовок, чипи, дії, діалоги, конфлікти.
// Тіло (diff, варіанти, поле відповіді) передається як children.
const SuggestionFrame = ({
  suggestion,
  actions,
  busy = false,
  readOnly = false,
  highlighted = false,
  acceptOptionId = null,
  acceptDisabled = false,
  primary = null, // { label, icon, disabled, onClick } — заміна кнопки «Прийняти» (питання)
  hideRefine = false,
  children,
}) => {
  const s = suggestion;
  const resolved = s.status !== 'pending';
  const severity = SEVERITY[s.severity] || SEVERITY.low;
  const advisory = s.applicable === false && s.kind !== 'question';
  const conflictsWith = s.status === 'pending' ? (s.conflictsWith || []) : [];

  const [expanded, setExpanded] = useState(!resolved);
  const [dialog, setDialog] = useState(null); // 'reject' | 'refine' | 'conflict'
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState([]);

  useEffect(() => {
    setExpanded(s.status === 'pending');
  }, [s.status]);

  // Виконує дію, обробляє конфлікт/помилку. Закриває діалог лише при успіху.
  const exec = async (fn) => {
    setError('');
    const result = await fn();
    if (result?.ok) {
      setDialog(null);
      return true;
    }
    if (result?.code === 'SUGGESTION_CONFLICT') {
      setConflicts(result.conflicts || []);
      setDialog('conflict');
      return false;
    }
    setError(result?.error || 'Не вдалося виконати дію');
    return false;
  };

  const acceptBody = (extra = {}) => (acceptOptionId ? { optionId: acceptOptionId, ...extra } : extra);
  const doAccept = () => exec(() => actions.accept(s.id, acceptBody()));
  // Порада без правки: «Зрозуміло» = accept без optionId (статус accepted, документ не змінюється)
  const dismissAdvisory = () => exec(() => actions.accept(s.id, {}));
  const closeDialog = () => { setDialog(null); setError(''); };

  const canAct = !readOnly && !resolved;

  return (
    <Paper
      id={`suggestion-${s.id}`}
      variant="outlined"
      sx={{
        mb: 1.5,
        p: 2,
        maxWidth: '95%',
        borderLeft: '4px solid',
        borderLeftColor: resolved ? 'divider' : `${severity.color === 'default' ? 'grey' : severity.color}.main`,
        opacity: resolved && !expanded ? 0.9 : 1,
        outline: highlighted ? '2px solid' : '2px solid transparent',
        outlineColor: highlighted ? 'primary.main' : 'transparent',
        transition: 'outline-color 0.3s',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
        <Chip size="small" color={severity.color} label={severity.label} />
        {GROUP_LABELS[s.group] && <Chip size="small" variant="outlined" label={GROUP_LABELS[s.group]} />}
        {(s.criterionTitle || s.criterionId) && (
          <Tooltip title={s.criterionId ? `Критерій: ${s.criterionId}` : ''}>
            <Chip size="small" variant="outlined" label={s.criterionTitle || s.criterionId} sx={{ maxWidth: 280 }} />
          </Tooltip>
        )}
        {s.kind === 'question' && <Chip size="small" color="info" variant="outlined" label="Питання" />}
        {advisory && <Chip size="small" variant="outlined" label="Порада без правки" />}
        {conflictsWith.length > 0 && (
          <Tooltip title={conflictsWith.map((c) => c.title).join('; ')}>
            <Chip
              size="small"
              color="warning"
              icon={<WarningAmber />}
              label={conflictsWith.length === 1
                ? `Конфлікт з прийнятою: ${conflictsWith[0].title}`
                : `Конфлікт з ${conflictsWith.length} прийнятими`}
              sx={{ maxWidth: 360 }}
            />
          </Tooltip>
        )}
        {resolved && (
          <IconButton
            size="small"
            sx={{ ml: 'auto' }}
            aria-label={expanded ? 'Згорнути' : 'Розгорнути'}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        )}
      </Stack>

      <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.35 }}>{s.title}</Typography>
      {resolved && <Box sx={{ mt: 0.5 }}><ResolvedSummary suggestion={s} /></Box>}

      <Collapse in={expanded} unmountOnExit>
        {s.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5, whiteSpace: 'pre-wrap' }}>
            {s.description}
          </Typography>
        )}
        {children}
      </Collapse>

      {error && !dialog && <Alert severity="error" sx={{ mt: 1.5 }} onClose={() => setError('')}>{error}</Alert>}

      {canAct && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
          {primary ? (
            <Button
              variant="contained"
              size="small"
              startIcon={primary.icon || <Check />}
              disabled={busy || primary.disabled}
              onClick={() => exec(primary.onClick)}
            >
              {primary.label}
            </Button>
          ) : advisory ? (
            <Button variant="contained" size="small" startIcon={<Check />} disabled={busy} onClick={dismissAdvisory}>
              Зрозуміло
            </Button>
          ) : (
            <Button
              variant="contained"
              size="small"
              startIcon={<Check />}
              disabled={busy || acceptDisabled}
              onClick={doAccept}
            >
              Прийняти
            </Button>
          )}
          {!hideRefine && !advisory && (
            <Button variant="outlined" size="small" startIcon={<Edit />} disabled={busy} onClick={() => setDialog('refine')}>
              Змінити
            </Button>
          )}
          <Button
            variant="outlined"
            size="small"
            color="warning"
            startIcon={<Close />}
            disabled={busy}
            onClick={() => setDialog('reject')}
          >
            Відхилити
          </Button>
        </Stack>
      )}

      {!readOnly && resolved && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<Replay />}
          disabled={busy}
          sx={{ mt: 1 }}
          onClick={() => exec(() => actions.reopen(s.id))}
        >
          Повернутися
        </Button>
      )}

      <RejectDialog
        open={dialog === 'reject'}
        requiresReason={!!s.requiresReason}
        busy={busy}
        error={dialog === 'reject' ? error : ''}
        onClose={closeDialog}
        onSubmit={(body) => exec(() => actions.reject(s.id, body))}
      />
      <RefineDialog
        open={dialog === 'refine'}
        busy={busy}
        error={dialog === 'refine' ? error : ''}
        onClose={closeDialog}
        onSubmit={(body) => exec(() => actions.refine(s.id, body))}
      />
      <ConflictDialog
        open={dialog === 'conflict'}
        conflicts={conflicts}
        busy={busy}
        error={dialog === 'conflict' ? error : ''}
        onKeep={closeDialog}
        onReplace={() => exec(() => actions.accept(s.id, acceptBody({ conflictResolution: 'replacePrevious' })))}
        onMerge={() => exec(() => actions.refine(s.id, { mergeWithAccepted: true }))}
      />
    </Paper>
  );
};

export default SuggestionFrame;
