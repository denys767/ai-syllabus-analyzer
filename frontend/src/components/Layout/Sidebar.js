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
  BarChart,
  School,
  Upload,
  Assessment,
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
    // Спеціальна логіка для роботи з вкладеними шляхами
    if (path === '/syllabi/upload') {
      return location.pathname === '/syllabi/upload';
    }
    if (path === '/syllabi') {
      return location.pathname === '/syllabi' || 
             (location.pathname.startsWith('/syllabi/') && location.pathname !== '/syllabi/upload');
    }
    // Точне співпадіння для основних шляхів
    if (path === '/dashboard' || path === '/manager' || path === '/admin') {
      return location.pathname === path;
    }
    // Для інших вкладених шляхів перевіряємо початок
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const instructorItems = [
    {
      text: 'Дашборд',
      icon: <Dashboard />,
      path: '/dashboard',
      roles: ['instructor', 'admin'],
    },
    {
      text: 'Мої силабуси',
      icon: <Description />,
      path: '/syllabi',
      roles: ['instructor', 'admin'],
    },
    {
      text: 'Завантажити силабус',
      icon: <Upload />,
      path: '/syllabi/upload',
      roles: ['instructor', 'admin'],
    },
  // AI Challenger доступний у панелі окремого силабусу; глобального маршруту немає
  ];

  const managerItems = [
    {
      text: 'Менеджер дашборд',
      icon: <Dashboard />,
      path: '/manager',
      roles: ['manager', 'admin'],
    },
    {
      text: 'Звіти',
      icon: <Assessment />,
      path: '/manager/reports',
      roles: ['manager', 'admin'],
    },
  ];

  const adminItems = [
    {
      text: 'Адмін-панель',
      icon: <AdminPanelSettings />,
      path: '/admin',
      roles: ['admin'],
    },
    {
      text: 'Керування користувачами',
      icon: <People />,
      path: '/admin/users',
      roles: ['admin'],
    },
    {
      text: 'Системна аналітика',
      icon: <BarChart />,
      path: '/admin/analytics',
      roles: ['admin'],
    },
  ];

  const getRoleBasedMenuItems = () => {
    let items = [];
    
    switch (user?.role) {
      case 'admin':
        // Адмін має доступ до всіх розділів, але без дублікатів
        items = [
          ...instructorItems,
          ...managerItems,
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

    // Видаляємо дублікати за шляхом
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
      'admin': 'Адмін',
      'manager': 'Менеджер',
      'instructor': 'Викладач',
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
          {user?.department || 'KSE'}
        </Typography>
      </Box>
    </Box>
  );
};

export default Sidebar;
