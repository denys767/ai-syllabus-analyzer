import React from 'react';
import {
  Toolbar,
  Typography,
  IconButton,
  Box,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Badge,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Notifications as NotificationsIcon,
  AccountCircle,
  Settings,
  Logout,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const Header = ({ onMenuClick, drawerOpen }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = React.useState(null);

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleProfile = () => {
    handleClose();
    navigate('/profile');
  };

  const handleSettings = () => {
    handleClose();
    navigate('/settings');
  };

  const handleLogout = () => {
    handleClose();
    logout();
    navigate('/login');
  };

  const getUserInitials = (user) => {
    if (!user) return 'U';
    const first = user.firstName?.charAt(0) || '';
    const last = user.lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || user.email.charAt(0).toUpperCase();
  };

  return (
    <Toolbar>
      <IconButton
        color="inherit"
        aria-label="open drawer"
        edge="start"
        onClick={onMenuClick}
        sx={{ mr: 2 }}
      >
        <MenuIcon />
      </IconButton>

      <Typography
        variant="h6"
        noWrap
        component="div"
        sx={{ 
          flexGrow: 1,
          fontWeight: 600,
          color: 'text.primary'
        }}
      >
        AI Syllabus Analyzer
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* Notifications */}
        <IconButton
          size="large"
          aria-label="show notifications"
          color="inherit"
        >
          <Badge badgeContent={0} color="error">
            <NotificationsIcon />
          </Badge>
        </IconButton>

        {/* User menu */}
        <IconButton
          size="large"
          aria-label="account of current user"
          aria-controls="menu-appbar"
          aria-haspopup="true"
          onClick={handleMenu}
          color="inherit"
        >
          <Avatar
            sx={{ 
              width: 32, 
              height: 32,
              bgcolor: 'primary.main',
              fontSize: '0.875rem'
            }}
            src={user?.avatarUrl || undefined}
          >
            {getUserInitials(user)}
          </Avatar>
        </IconButton>

        <Menu
          id="menu-appbar"
          anchorEl={anchorEl}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          keepMounted
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          open={Boolean(anchorEl)}
          onClose={handleClose}
          sx={{
            mt: 1,
            '& .MuiPaper-root': {
              minWidth: 200,
              boxShadow: '0 4px 20px 0 rgba(0,0,0,0.12)',
            }
          }}
        >
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle2" color="text.primary">
              {user?.firstName} {user?.lastName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.email}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {user?.role === 'instructor' ? 'Викладач' : 
               user?.role === 'admin' ? 'Адміністратор' : 
               user?.role === 'manager' ? 'Менеджер' : user?.role}
            </Typography>
          </Box>
          
          <Divider />
          
          <MenuItem onClick={handleProfile}>
            <AccountCircle sx={{ mr: 2 }} />
            Профіль
          </MenuItem>
          
          <MenuItem onClick={handleSettings}>
            <Settings sx={{ mr: 2 }} />
            Налаштування
          </MenuItem>
          
          <Divider />
          
          <MenuItem onClick={handleLogout}>
            <Logout sx={{ mr: 2 }} />
            Вийти
          </MenuItem>
        </Menu>
      </Box>
    </Toolbar>
  );
};

export default Header;
