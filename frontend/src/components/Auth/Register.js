import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  IconButton,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Paper,
  LinearProgress,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  School,
  PersonAdd,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

const Register = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    department: '',
    position: '',
    role: 'instructor',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const departments = [
    'Факультет економіки',
    'Факультет права',
    'Факультет бізнесу',
    'Факультет комп\'ютерних наук',
    'Факультет публічної політики',
    'Інше',
  ];

  const positions = [
    'Професор',
    'Доцент',
    'Асистент',
    'Лектор',
    'Викладач',
    'Науковий співробітник',
    'Адміністратор',
  ];

  const validatePassword = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    
    if (password.length < minLength) {
      return 'Пароль повинен містити мінімум 8 символів';
    }
    if (!hasUpperCase) {
      return 'Пароль повинен містити хоча б одну велику літеру';
    }
    if (!hasLowerCase) {
      return 'Пароль повинен містити хоча б одну малу літеру';
    }
    if (!hasNumbers) {
      return 'Пароль повинен містити хоча б одну цифру';
    }
    return '';
  };

  const getPasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/[a-z]/.test(password)) strength += 25;
    if (/\d/.test(password)) strength += 25;
    return strength;
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Паролі не співпадають');
      return;
    }

    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);

    try {
      const { confirmPassword, ...registrationData } = formData;
      await register(registrationData);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Помилка реєстрації');
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength(formData.password);
  const passwordStrengthColor = 
    passwordStrength < 50 ? 'error' : 
    passwordStrength < 75 ? 'warning' : 'success';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 2,
      }}
    >
      <Paper
        elevation={12}
        sx={{
          maxWidth: 500,
          width: '100%',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            background: 'linear-gradient(45deg, #1976d2 30%, #2196f3 90%)',
            color: 'white',
            py: 3,
            px: 3,
            textAlign: 'center',
          }}
        >
          <School sx={{ fontSize: 40, mb: 1 }} />
          <Typography variant="h5" fontWeight="bold" gutterBottom>
            Реєстрація в KSE
          </Typography>
          <Typography variant="body2" opacity={0.9}>
            AI Syllabus Analyzer
          </Typography>
        </Box>

        <CardContent sx={{ p: 4 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <TextField
                fullWidth
                label="Ім'я"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                required
                variant="outlined"
              />
              <TextField
                fullWidth
                label="Прізвище"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                required
                variant="outlined"
              />
            </Box>

            <TextField
              fullWidth
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
              margin="normal"
              variant="outlined"
              sx={{ mb: 2 }}
            />

            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Факультет</InputLabel>
                <Select
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  required
                  label="Факультет"
                >
                  {departments.map((dept) => (
                    <MenuItem key={dept} value={dept}>
                      {dept}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>Посада</InputLabel>
                <Select
                  name="position"
                  value={formData.position}
                  onChange={handleChange}
                  required
                  label="Посада"
                >
                  {positions.map((pos) => (
                    <MenuItem key={pos} value={pos}>
                      {pos}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <TextField
              fullWidth
              label="Пароль"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={handleChange}
              required
              margin="normal"
              variant="outlined"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            {formData.password && (
              <Box sx={{ mt: 1, mb: 2 }}>
                <LinearProgress
                  variant="determinate"
                  value={passwordStrength}
                  color={passwordStrengthColor}
                  sx={{ height: 6, borderRadius: 3 }}
                />
                <Typography variant="caption" color="text.secondary">
                  Надійність паролю: {passwordStrength}%
                </Typography>
              </Box>
            )}

            <TextField
              fullWidth
              label="Підтвердити пароль"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              margin="normal"
              variant="outlined"
              sx={{ mb: 3 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      edge="end"
                    >
                      {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              startIcon={<PersonAdd />}
              sx={{
                py: 1.5,
                mb: 3,
                background: 'linear-gradient(45deg, #1976d2 30%, #2196f3 90%)',
                '&:hover': {
                  background: 'linear-gradient(45deg, #1565c0 30%, #1976d2 90%)',
                },
              }}
            >
              {loading ? 'Реєстрація...' : 'Зареєструватися'}
            </Button>

            <Divider sx={{ mb: 3 }}>або</Divider>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Вже маєте обліковий запис?{' '}
                <Link
                  to="/login"
                  style={{
                    color: '#1976d2',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  Увійти
                </Link>
              </Typography>
            </Box>
          </form>
        </CardContent>
      </Paper>
    </Box>
  );
};

export default Register;
