import React, { useEffect, useRef, useState } from 'react';
import { Box, IconButton, InputBase, Tooltip } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { Check, Close } from '@mui/icons-material';

// Розбиває текст чернетки на шматки: звичайний текст і proposedValues.
// З template — за плейсхолдерами {{id}}; без нього — шукаємо значення в тексті (перше входження).
export function splitDraft(text, template, values = []) {
  const byId = new Map(values.map((v) => [v.id, v]));
  if (template) {
    return String(template).split(/(\{\{\w+\}\})/).filter(Boolean).map((chunk) => {
      const m = /^\{\{(\w+)\}\}$/.exec(chunk);
      const v = m && byId.get(m[1]);
      return v ? { value: v } : { text: chunk };
    });
  }
  let chunks = [{ text: String(text || '') }];
  values.forEach((v) => {
    if (!v.value) return;
    let done = false;
    chunks = chunks.flatMap((c) => {
      if (done || c.value) return [c];
      const at = c.text.indexOf(v.value);
      if (at < 0) return [c];
      done = true;
      return [
        { text: c.text.slice(0, at) },
        { value: v },
        { text: c.text.slice(at + v.value.length) },
      ].filter((x) => x.value || x.text);
    });
  });
  return chunks;
}

const InlineEditor = ({ initial, label, busy, onSave, onCancel }) => {
  const [draft, setDraft] = useState(initial);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const save = () => {
    const trimmed = draft.trim();
    if (trimmed) onSave(trimmed);
  };
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, verticalAlign: 'middle' }}>
      <InputBase
        inputRef={ref}
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') onCancel();
        }}
        inputProps={{ 'aria-label': label, size: Math.max(4, draft.length + 1) }}
        sx={{
          px: 0.75,
          border: '1px solid',
          borderColor: 'warning.main',
          borderRadius: 1,
          fontSize: 'inherit',
          lineHeight: 1.4,
          bgcolor: 'background.paper',
        }}
      />
      <Tooltip title="Save">
        <span>
          <IconButton size="small" aria-label="Save value" disabled={busy || !draft.trim()} onClick={save}><Check fontSize="inherit" /></IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Cancel">
        <IconButton size="small" aria-label="Cancel editing" disabled={busy} onClick={onCancel}><Close fontSize="inherit" /></IconButton>
      </Tooltip>
    </Box>
  );
};

// Текст чернетки з підсвіченими proposedValues. Непідтверджені — акцентний фон, підтверджені — рамка primary.
// editingId — значення, яке зараз редагується інлайн; onEdit(id) / onSave(id, value) / onCancel.
const DraftText = ({ text, template, values = [], editable = false, editingId = null, busy, onEdit, onSave, onCancel, sx }) => {
  const theme = useTheme();
  const accent = theme.palette.warning.main;
  const chunks = splitDraft(text, template, values);
  return (
    <Box component="div" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', typography: 'body2', lineHeight: 1.7, ...sx }}>
      {chunks.map((c, i) => {
        if (!c.value) {
          // eslint-disable-next-line react/no-array-index-key
          return <span key={`t-${i}`}>{c.text}</span>;
        }
        const v = c.value;
        if (editingId === v.id) {
          return <InlineEditor key={`e-${v.id}`} initial={v.value} label={v.label || 'Value'} busy={busy} onSave={(val) => onSave(v.id, val)} onCancel={onCancel} />;
        }
        return (
          <Tooltip key={`v-${v.id}-${i}`} title={`${v.label || 'Proposed value'}${v.confirmed ? ' · confirmed' : ' · suggested by AI'}${editable ? ' · click to change' : ''}`}>
            <Box
              component="mark"
              role={editable ? 'button' : undefined}
              tabIndex={editable ? 0 : undefined}
              onClick={editable ? () => onEdit(v.id) : undefined}
              onKeyDown={editable ? (e) => { if (e.key === 'Enter') onEdit(v.id); } : undefined}
              sx={{
                color: 'inherit',
                px: 0.5,
                py: 0.1,
                borderRadius: 1,
                fontWeight: 600,
                cursor: editable ? 'pointer' : 'default',
                bgcolor: v.confirmed ? 'transparent' : alpha(accent, theme.palette.mode === 'dark' ? 0.3 : 0.18),
                border: '1px solid',
                borderColor: v.confirmed ? 'primary.main' : alpha(accent, 0.6),
              }}
            >
              {v.value}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
};

export default DraftText;
