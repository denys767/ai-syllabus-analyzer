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
import ProfessorTutorWorkspace from './pages/ProfessorTutorWorkspace';
import Cabinet from './pages/Cabinet';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import PoliciesPage from './pages/PoliciesPage';
import ConfirmEmailChange from './pages/ConfirmEmailChange';

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

  const defaultRoute = user?.role === 'admin' ? '/cabinet' : '/workspace';

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={user ? <Navigate to={defaultRoute} replace /> : <Login />}
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
        <Route index element={<Navigate to={defaultRoute} replace />} />
        <Route path="workspace" element={<ProfessorTutorWorkspace />} />
        <Route path="workspace/:syllabusId" element={<ProfessorTutorWorkspace />} />
        <Route
          path="cabinet"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <Cabinet />
            </ProtectedRoute>
          }
        />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="policies" element={<PoliciesPage />} />
      </Route>

      {/* 404 route */}
      <Route path="*" element={<Navigate to={defaultRoute} replace />} />
    </Routes>
  );
}

export default App;
