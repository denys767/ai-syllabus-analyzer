import React, { createContext, useContext, useReducer, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

const initialState = {
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: false,
  isLoading: true,
};

const authReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
      };
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case 'UPDATE_USER':
      return {
        ...state,
        user: { ...state.user, ...action.payload },
      };
    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
      };
    default:
      return state;
  }
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      
      if (token) {
        try {
          api.setAuthToken(token);
          const response = await api.auth.getProfile();
          dispatch({
            type: 'SET_USER',
            payload: response.data.user,
          });
        } catch (error) {
          console.error('Auth initialization failed:', error);
          localStorage.removeItem('token');
          dispatch({ type: 'LOGOUT' });
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    // Обробник автоматичного logout при 401 помилці
    const handleAuthLogout = () => {
      dispatch({ type: 'LOGOUT' });
    };

    window.addEventListener('auth_logout', handleAuthLogout);
    initializeAuth();

    return () => {
      window.removeEventListener('auth_logout', handleAuthLogout);
    };
  }, []);

  const login = async (email, password) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
  const response = await api.auth.login(email, password);
      const { user, token } = response.data;

      localStorage.setItem('token', token);
      api.setAuthToken(token);

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user, token },
      });

      return { success: true };
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      const errorMessage = error.response?.data?.message || 'Помилка входу';
      throw new Error(errorMessage);
    }
  };

  const register = async () => ({ success: false, error: 'Публічна реєстрація вимкнена. Зверніться до адміністратора.' });

  const logout = () => {
    localStorage.removeItem('token');
    api.setAuthToken(null);
    dispatch({ type: 'LOGOUT' });
  };

  const updateProfile = async (profileData) => {
    try {
      const response = await api.auth.updateProfile(profileData);
      dispatch({
        type: 'UPDATE_USER',
        payload: response.data.user,
      });
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Помилка оновлення профілю';
      return { success: false, error: errorMessage };
    }
  };

  const forgotPassword = async (email) => {
    try {
      await api.auth.forgotPassword(email);
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Помилка відновлення паролю';
      return { success: false, error: errorMessage };
    }
  };

  const resetPassword = async (token, password) => {
    try {
      await api.auth.resetPassword(token, password);
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Помилка скидання паролю';
      return { success: false, error: errorMessage };
    }
  };

  const value = {
    user: state.user,
    token: state.token,
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    login,
  register,
    logout,
    updateProfile,
    forgotPassword,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
