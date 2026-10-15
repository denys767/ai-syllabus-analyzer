import React from 'react';
import { Box, IconButton, Tab, Tabs, Tooltip } from '@mui/material';
import { Add, Close } from '@mui/icons-material';

const WorkspaceTabs = ({ tabs, activeId, onSelect, onClose, onNew, extra }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', px: 1, bgcolor: 'background.paper' }}>
    <Tabs
      value={activeId && tabs.some((t) => t.id === activeId) ? activeId : false}
      onChange={(_e, value) => onSelect(value)}
      variant="scrollable"
      scrollButtons="auto"
      sx={{ flexGrow: 1, minHeight: 40 }}
    >
      {tabs.map((t) => (
        <Tab
          key={t.id}
          value={t.id}
          sx={{ minHeight: 40, textTransform: 'none', pr: 1 }}
          label={(
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title || 'Без назви'}
              </Box>
              <IconButton
                size="small"
                component="span"
                onClick={(e) => { e.stopPropagation(); onClose(t.id); }}
                sx={{ p: 0.25 }}
              >
                <Close sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          )}
        />
      ))}
    </Tabs>
    {extra}
    <Tooltip title="Новий силабус">
      <IconButton size="small" onClick={onNew}>
        <Add fontSize="small" />
      </IconButton>
    </Tooltip>
  </Box>
);

export default WorkspaceTabs;
