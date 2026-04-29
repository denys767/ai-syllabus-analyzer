import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Chip,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import { Chat, DoorFront, Policy, Shield } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

export default function Sidebar({ onItemClick }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const items =
    user?.role === 'admin'
      ? [
          { text: 'Cabinet', icon: <Shield />, path: '/cabinet' },
          { text: 'Documents', icon: <Policy />, path: '/policies' },
        ]
      : [
          { text: "Professor's Tutor", icon: <Chat />, path: '/dashboard' },
          { text: 'Documents', icon: <Policy />, path: '/policies' },
        ];

  const active = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ display: 'flex', alignItems: 'center', gap: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        <DoorFront color="primary" />
        <Box>
          <Typography fontWeight={700}>Professor&apos;s Tutor</Typography>
          <Typography variant="caption" color="text.secondary">
            KSE workflow
          </Typography>
        </Box>
      </Toolbar>

      <Box sx={{ px: 1, py: 2, flex: 1 }}>
        <List>
          {items.map((item) => (
            <ListItem key={item.path} disablePadding>
              <ListItemButton
                selected={active(item.path)}
                onClick={() => {
                  navigate(item.path);
                  onItemClick?.();
                }}
                sx={{ borderRadius: 3, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Chip label={user?.role === 'admin' ? 'Admin' : 'Instructor'} size="small" color="primary" sx={{ mb: 1 }} />
        <Typography variant="body2">
          {user?.firstName} {user?.lastName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {user?.email}
        </Typography>
      </Box>
    </Box>
  );
}
