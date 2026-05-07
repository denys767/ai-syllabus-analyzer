import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Chip,
} from '@mui/material';
import {
  Forum,
  AdminPanelSettings,
  School,
  Policy,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

const Sidebar = ({ onItemClick }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleNavigation = (path) => {
    if (path === '/workspace') {
      const userId = user?.id || user?._id || 'anon';
      const lastChatId = localStorage.getItem(`pt.lastChat.v1.${userId}`);
      navigate(lastChatId ? `/workspace/${lastChatId}` : path);
    } else {
      navigate(path);
    }
    if (onItemClick) onItemClick();
  };

  const isActive = (path) => {
    if (path === '/workspace' || path === '/cabinet') {
      return location.pathname === path || location.pathname.startsWith(path + '/');
    }
    return location.pathname === path;
  };

  const items = [
    {
      text: 'Chat',
      icon: <Forum />,
      path: '/workspace',
      roles: ['instructor', 'admin', 'manager'],
    },
    {
      text: 'Cabinet',
      icon: <AdminPanelSettings />,
      path: '/cabinet',
      roles: ['admin', 'manager', 'instructor'],
    },
    {
      text: 'Documents',
      icon: <Policy />,
      path: '/policies',
      roles: ['instructor', 'admin', 'manager'],
    },
  ].filter((item) => item.roles.includes(user?.role));

  const roleColors = { admin: 'error', instructor: 'primary', manager: 'warning' };
  const roleLabels = { admin: 'Admin', instructor: 'Instructor', manager: 'Manager' };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <School color="primary" sx={{ mr: 1 }} />
        <Typography variant="h6" color="primary" fontWeight="600">
          KSE
        </Typography>
        {user?.role && (
          <Chip
            label={roleLabels[user.role] || user.role}
            color={roleColors[user.role] || 'default'}
            size="small"
            sx={{ ml: 1 }}
          />
        )}
      </Toolbar>

      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        <List sx={{ px: 1, py: 2 }}>
          {items.map((item) => (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                selected={isActive(item.path)}
                onClick={() => handleNavigation(item.path)}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  '&.Mui-selected': {
                    backgroundColor: 'primary.main',
                    color: 'primary.contrastText',
                    '&:hover': { backgroundColor: 'primary.dark' },
                    '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 40,
                    color: isActive(item.path) ? 'inherit' : 'text.secondary',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{
                    fontWeight: isActive(item.path) ? 600 : 400,
                    fontSize: '0.875rem',
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="body2" color="text.secondary">
          {user?.firstName} {user?.lastName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {user?.email || 'kse.edu'}
        </Typography>
      </Box>
    </Box>
  );
};

export default Sidebar;
