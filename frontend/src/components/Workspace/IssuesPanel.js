import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  LinearProgress,
  Divider,
  Chip,
} from '@mui/material';
import { Warning, RadioButtonUnchecked, CheckCircle } from '@mui/icons-material';

const IssuesPanel = ({ issues = [], readiness = { score: 0 }, currentIssueId }) => {
  const open = issues.filter((i) => i.decision === 'pending');
  const resolved = issues.filter((i) => i.decision && i.decision !== 'pending');
  const score = readiness?.score ?? 0;
  const scoreLabel = score === 100 ? 'Ready to submit' : score >= 75 ? 'Nearly there' : score >= 50 ? 'Making progress' : 'Needs work';

  return (
    <Box sx={{ width: 300, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h6">Issues</Typography>
        <Typography variant="caption" color="text.secondary">
          {open.length} open · {resolved.length} resolved
        </Typography>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        <List dense disablePadding>
          {issues.map((issue) => {
            const isResolved = issue.decision && issue.decision !== 'pending';
            const isCurrent = issue.id === currentIssueId;
            const isCritical = issue.priority === 'critical';
            return (
              <ListItem
                key={issue.id}
                sx={{
                  borderLeft: '3px solid',
                  borderLeftColor: isCurrent ? 'primary.main' : 'transparent',
                  bgcolor: isCurrent ? 'action.hover' : 'transparent',
                  py: 1,
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {isResolved ? (
                    <CheckCircle fontSize="small" color="success" />
                  ) : isCritical ? (
                    <Warning fontSize="small" color="warning" />
                  ) : (
                    <RadioButtonUnchecked fontSize="small" color="action" />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={issue.title}
                  primaryTypographyProps={{
                    variant: 'body2',
                    sx: {
                      fontWeight: isCurrent ? 600 : 400,
                      textDecoration: issue.decision === 'rejected' ? 'line-through' : 'none',
                      color: issue.decision === 'rejected' ? 'text.secondary' : 'text.primary',
                    },
                  }}
                  secondary={issue.groupTag}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItem>
            );
          })}
          {!issues.length && (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">No issues yet.</Typography>
            </Box>
          )}
        </List>
      </Box>

      <Divider />
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">Readiness · {score}%</Typography>
          {score === 100 && <Chip label="Ready" size="small" color="success" />}
        </Box>
        <LinearProgress
          variant="determinate"
          value={score}
          color={score === 100 ? 'success' : score >= 50 ? 'primary' : 'warning'}
          sx={{ height: 8, borderRadius: 4 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {scoreLabel}
        </Typography>
      </Box>
    </Box>
  );
};

export default IssuesPanel;
