import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';

import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout/Layout';
import ProtectedRoute from './components/Auth/ProtectedRoute';

// Auth pages
import Login from './components/Auth/Login';
import ResetPassword from './components/Auth/ResetPassword';
import VerifyEmail from './components/Auth/VerifyEmail';

// Main pages
import Dashboard from './pages/Dashboard';
import SyllabusUpload from './pages/SyllabusUpload';
import SyllabusAnalysis from './pages/SyllabusAnalysis';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import PoliciesPage from './pages/PoliciesPage';
import ConfirmEmailChange from './pages/ConfirmEmailChange';
import Cabinet from './pages/Cabinet';

function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        bgcolor="background.default"
      >
        <CircularProgress size={40} />
      </Box>
    );
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={user ? <Navigate to={user.role === 'admin' ? '/cabinet' : '/dashboard'} replace /> : <Login />}
      />
      <Route path="/confirm-email-change" element={<ConfirmEmailChange />} />
  <Route path="/reset-password" element={<ResetPassword />} />
  <Route path="/verify-email" element={<VerifyEmail />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={<Navigate to={user?.role === 'admin' ? '/cabinet' : '/dashboard'} replace />}
        />
        <Route path="dashboard" element={<Dashboard />} />
  <Route path="profile" element={<Profile />} />
  <Route path="settings" element={<Settings />} />
        <Route path="policies" element={<PoliciesPage />} />
        
        {/* Syllabus routes for instructors */}
        <Route path="syllabi" element={<Navigate to="/dashboard" replace />} />
        <Route 
          path="syllabi/upload" 
          element={
            <ProtectedRoute requiredRoles={['instructor', 'manager']}>
              <SyllabusUpload />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="syllabi/:id" 
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin', 'manager']}>
              <SyllabusAnalysis />
            </ProtectedRoute>
          } 
        />
        
        {/* Admin routes */}
        <Route
          path="cabinet"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <Cabinet />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <Navigate to="/cabinet" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/users"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <Navigate to="/cabinet" replace />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* 404 route */}
      <Route path="*" element={<Navigate to={user?.role === 'admin' ? '/cabinet' : '/dashboard'} replace />} />
    </Routes>
  );
}

export default App;
