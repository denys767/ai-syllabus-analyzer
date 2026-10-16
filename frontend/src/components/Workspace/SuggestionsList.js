import React, { useMemo, useState } from 'react';
import {
  Box,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import {
  CheckCircle,
  ExpandLess,
  ExpandMore,
  HelpOutline,
  RadioButtonUnchecked,
  RemoveCircleOutline,
  Warning,
} from '@mui/icons-material';
import { SEVERITY, STATUS_LABELS } from './constants';

const STATUS_ORDER = ['pending', 'accepted', 'rejected'];

const StatusIcon = ({ suggestion }) => {
  if (suggestion.status === 'accepted') return <CheckCircle fontSize="small" color="success" />;
  if (suggestion.status === 'rejected') return <RemoveCircleOutline fontSize="small" color="disabled" />;
  if (suggestion.kind === 'question') return <HelpOutline fontSize="small" color="info" />;
  if (suggestion.severity === 'critical') return <Warning fontSize="small" color="error" />;
  if (suggestion.severity === 'high') return <Warning fontSize="small" color="warning" />;
  return <RadioButtonUnchecked fontSize="small" color="action" />;
};

// Пропозиції, згруповані за статусом; всередині «Очікують» — за важливістю. Клік прокручує до картки.
const SuggestionsList = ({ suggestions = [], onSelect }) => {
  const [collapsed, setCollapsed] = useState({ rejected: true });

  const groups = useMemo(() => STATUS_ORDER.map((status) => {
    const items = suggestions
      .filter((s) => s.status === status)
      .sort((a, b) => (
        (SEVERITY[b.severity]?.rank || 0) - (SEVERITY[a.severity]?.rank || 0)
        || (a.order ?? 0) - (b.order ?? 0)
      ));
    return { status, items };
  }).filter((g) => g.items.length), [suggestions]);

  if (!groups.length) {
    return <Typography variant="body2" color="text.secondary">Пропозицій поки немає.</Typography>;
  }

  return (
    <Box>
      {groups.map(({ status, items }) => {
        const isCollapsed = !!collapsed[status];
        return (
          <Box key={status} sx={{ mb: 0.5 }}>
            <ListItemButton
              dense
              onClick={() => setCollapsed((c) => ({ ...c, [status]: !c[status] }))}
              sx={{ borderRadius: 1, px: 0.5 }}
            >
              <ListItemText
                primary={`${STATUS_LABELS[status]} · ${items.length}`}
                primaryTypographyProps={{ variant: 'caption', sx: { fontWeight: 700, textTransform: 'uppercase' } }}
              />
              {isCollapsed ? <ExpandMore fontSize="small" /> : <ExpandLess fontSize="small" />}
            </ListItemButton>
            <Collapse in={!isCollapsed} unmountOnExit>
              <List dense disablePadding>
                {items.map((s) => (
                  <ListItemButton key={s.id} onClick={() => onSelect?.(s.id)} sx={{ borderRadius: 1, py: 0.5, px: 0.5 }}>
                    <ListItemIcon sx={{ minWidth: 28 }}><StatusIcon suggestion={s} /></ListItemIcon>
                    <ListItemText
                      primary={s.title}
                      primaryTypographyProps={{
                        variant: 'body2',
                        sx: {
                          textDecoration: s.status === 'rejected' ? 'line-through' : 'none',
                          color: s.status === 'rejected' ? 'text.secondary' : 'text.primary',
                        },
                      }}
                      secondary={SEVERITY[s.severity]?.label}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Collapse>
          </Box>
        );
      })}
    </Box>
  );
};

export default SuggestionsList;
