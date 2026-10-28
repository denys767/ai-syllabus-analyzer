import React from 'react';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircle from '@mui/icons-material/AccountCircle';
import Settings from '@mui/icons-material/Settings';
import Logout from '@mui/icons-material/Logout';
import DarkMode from '@mui/icons-material/DarkMode';
import LightMode from '@mui/icons-material/LightMode';
import BrightnessAuto from '@mui/icons-material/BrightnessAuto';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useThemeMode } from '../../contexts/ThemeContext';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';

const Header = ({ onMenuClick, drawerOpen }) => {
  const { user, logout } = useAuth();
  const { mode, setMode } = useThemeMode();
  const handleThemeChange = (e, newMode) => {
    if (newMode) setMode(newMode);
  };
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
        aria-label="Open menu"
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
          color: 'common.white'
        }}
      >
        AI Syllabus Analyzer
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* Перемикач теми */}
        <ToggleButtonGroup
          value={mode}
          exclusive
          size="small"
          onChange={handleThemeChange}
          sx={{ mr: 1, bgcolor: 'background.paper', borderRadius: 2, '& .MuiToggleButton-root': { py: 0.5 } }}
        >
          <ToggleButton value="system" aria-label="system" title="System theme">
            <BrightnessAuto fontSize="small" />
          </ToggleButton>
          <ToggleButton value="light" aria-label="light" title="Light theme">
            <LightMode fontSize="small" />
          </ToggleButton>
          <ToggleButton value="dark" aria-label="dark" title="Dark theme">
            <DarkMode fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
        {/* Меню користувача */}
        <IconButton
          size="large"
          aria-label="Account"
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
              {user?.role === 'instructor' ? "Instructor" :
               user?.role === 'admin' ? "Administrator" : user?.role}
            </Typography>
          </Box>

          <Divider />

          <MenuItem onClick={handleProfile}>
            <AccountCircle sx={{ mr: 2 }} />
            Profile
          </MenuItem>

          <MenuItem onClick={handleSettings}>
            <Settings sx={{ mr: 2 }} />
            Settings
          </MenuItem>

          <Divider />

          <MenuItem onClick={handleLogout}>
            <Logout sx={{ mr: 2 }} />
            Sign out
          </MenuItem>
        </Menu>
      </Box>
    </Toolbar>
  );
};

export default Header;
