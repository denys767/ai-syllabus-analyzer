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
  Dashboard,
  Description,
  AdminPanelSettings,
  People,
  School,
  Upload,
  Assessment,
  Policy
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

const Sidebar = ({ onItemClick }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleNavigation = (path) => {
    navigate(path);
    if (onItemClick) {
      onItemClick();
    }
  };

  const isActive = (path) => {
    // Special logic for working with nested paths
    if (path === '/syllabi/upload') {
      return location.pathname === '/syllabi/upload';
    }
    if (path === '/syllabi') {
      return location.pathname === '/syllabi' || 
             (location.pathname.startsWith('/syllabi/') && location.pathname !== '/syllabi/upload');
    }
    // Exact match for main paths
    if (path === '/dashboard' || path === '/manager' || path === '/admin') {
      return location.pathname === path;
    }
    // For other nested paths, we check the beginning
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const instructorItems = [
    {
      text: 'Dashboard',
      icon: <Dashboard />,
      path: '/dashboard',
      roles: ['instructor', 'admin'],
    },
    {
      text: 'My Syllabi',
      icon: <Description />,
      path: '/syllabi',
      roles: ['instructor', 'admin'],
    },
    {
      text: 'Upload Syllabus',
      icon: <Upload />,
      path: '/syllabi/upload',
      roles: ['instructor'],
    },
    {
      text: 'Documents',
      icon: <Policy />,
      path: '/policies',
      roles: ['instructor', 'admin', 'manager'],
    },
  // AI Challenger available inside individual syllabus view; no global route
  ];

  const managerItems = [
    {
      text: 'Manager Dashboard',
      icon: <Dashboard />,
      path: '/manager',
      roles: ['manager', 'admin'],
    },
    {
      text: 'My Syllabi',
      icon: <Description />,
      path: '/syllabi',
      roles: ['manager'],
    },
    {
      text: 'Upload Syllabus',
      icon: <Upload />,
      path: '/syllabi/upload',
      roles: ['manager'],
    },
    {
      text: 'Reports',
      icon: <Assessment />,
      path: '/manager/reports',
      roles: ['manager','admin'],
    },
    {
      text: 'Documents',
      icon: <Policy />,
      path: '/policies',
      roles: ['manager','admin'],
    },
  ];

  const adminItems = [
    {
      text: 'Admin Panel',
      icon: <AdminPanelSettings />,
      path: '/admin',
      roles: ['admin'],
    },
    {
      text: 'User Management',
      icon: <People />,
      path: '/admin/users',
      roles: ['admin'],
    },
    // Removed deprecated analytics route (/admin/analytics)
  ];

  const getRoleBasedMenuItems = () => {
    let items = [];
    
    switch (user?.role) {
      case 'admin':
        // Admin: instructor + admin, WITHOUT manager (to avoid duplicate 'Reports')
        items = [
          ...instructorItems.filter((item) => item.path !== '/syllabi'),
          ...adminItems
        ];
        break;
      case 'manager':
        items = managerItems;
        break;
      case 'instructor':
      default:
        items = instructorItems;
        break;
    }

    // Remove duplicates by path
    const uniqueItems = items.filter(
      (item, index, self) => index === self.findIndex((t) => t.path === item.path)
    );

    return uniqueItems;
  };

  const hasRole = (roles) => {
    return roles.includes(user?.role);
  };

  const getRoleBadge = () => {
    const roleColors = {
      'admin': 'error',
      'manager': 'warning', 
      'instructor': 'primary',
    };

    const roleLabels = {
      'admin': 'Admin',
      'manager': 'Manager',
      'instructor': 'Instructor',
    };

    return (
      <Chip
        label={roleLabels[user?.role] || user?.role}
        color={roleColors[user?.role] || 'default'}
        size="small"
        sx={{ ml: 1 }}
      />
    );
  };

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
        {getRoleBadge()}
      </Toolbar>

      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        <List sx={{ px: 1, py: 2 }}>
          {getRoleBasedMenuItems()
            .filter(item => hasRole(item.roles))
            .map((item) => (
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
                      '&:hover': {
                        backgroundColor: 'primary.dark',
                      },
                      '& .MuiListItemIcon-root': {
                        color: 'primary.contrastText',
                      },
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
