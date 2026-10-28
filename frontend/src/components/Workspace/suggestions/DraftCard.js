import React, { useState } from 'react';
import { Box, Button, Menu, MenuItem, Typography } from '@mui/material';
import { Check, Tune } from '@mui/icons-material';
import SuggestionFrame from './SuggestionFrame';
import DraftText from './DraftText';
import valueText from './valueText';
import { S, confirmLabel } from '../../../strings';

const Pane = ({ label, children, muted = false }) => (
  <Box
    sx={{
      p: 1.5,
      borderRadius: 1,
      border: '1px solid',
      borderColor: 'divider',
      bgcolor: muted ? 'action.hover' : 'background.paper',
    }}
  >
    <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6, mb: 0.5 }}>{label}</Typography>
    {children}
  </Box>
);

// kind = 'edit': чернетка слота. Before — поточне значення (поле view `before`), After — draft з підсвіченими proposedValues.
// Confirm називає непідтверджені значення («Confirm · including 48 hours»); «Change the value» редагує одне значення інлайн.
const DraftCard = ({ suggestion, actions, busy, readOnly, ...frameProps }) => {
  const s = suggestion;
  const draft = s.draft || {};
  const values = draft.proposedValues || [];
  const unconfirmed = values.filter((v) => !v.confirmed);
  const pending = s.status === 'pending';
  const editable = pending && !readOnly && !busy;
  const [editingId, setEditingId] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [valueError, setValueError] = useState('');

  const afterText = valueText(draft.value);
  const beforeText = valueText(s.before);

  const startChange = (event) => {
    if (values.length === 1) setEditingId(values[0].id);
    else setMenuAnchor(event.currentTarget);
  };

  const saveValue = async (id, value) => {
    setValueError('');
    const result = await actions.setValue(s.id, id, value);
    if (result?.ok) setEditingId(null);
    else setValueError(result?.error || S.errAction);
  };

  return (
    <SuggestionFrame
      suggestion={s}
      actions={actions}
      busy={busy}
      readOnly={readOnly}
      error={valueError}
      onClearError={() => setValueError('')}
      primary={{
        label: confirmLabel(unconfirmed),
        icon: <Check />,
        disabled: !!editingId,
        onClick: () => actions.confirm(s.id),
      }}
      secondary={values.length > 0 ? (
        <Button variant="outlined" size="small" startIcon={<Tune />} disabled={busy || !!editingId} onClick={startChange}>
          {S.changeValue}
        </Button>
      ) : null}
      {...frameProps}
    >
      <Box sx={{ display: 'grid', gap: 1 }}>
        {beforeText && (
          <Pane label={S.before} muted>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {beforeText}
            </Typography>
          </Pane>
        )}
        <Pane label={beforeText ? S.after : S.proposed}>
          <DraftText
            text={afterText}
            template={draft.template}
            values={values}
            editable={editable}
            editingId={editingId}
            busy={busy}
            onEdit={setEditingId}
            onSave={saveValue}
            onCancel={() => setEditingId(null)}
          />
        </Pane>
        {pending && unconfirmed.length > 0 && (
          <Typography variant="caption" color="text.secondary">{S.valuesHint}</Typography>
        )}
      </Box>
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem disabled dense>{S.pickValue}</MenuItem>
        {values.map((v) => (
          <MenuItem key={v.id} onClick={() => { setMenuAnchor(null); setEditingId(v.id); }}>
            {v.label ? `${v.label}: ` : ''}{v.value}
          </MenuItem>
        ))}
      </Menu>
    </SuggestionFrame>
  );
};

export default DraftCard;
