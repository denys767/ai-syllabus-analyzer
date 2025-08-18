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
import SyllabiList from './pages/SyllabiList';
import SyllabusUpload from './pages/SyllabusUpload';
import SyllabusAnalysis from './pages/SyllabusAnalysis';

// Admin pages
import AdminDashboard from './pages/Admin/AdminDashboard';
import UserManagement from './components/Admin/UserManagement';

// Manager pages
import ManagerDashboard from './pages/Manager/ManagerDashboard';
import Reports from './components/Manager/Reports';
import Profile from './pages/Profile';
import Settings from './pages/Settings';

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
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />
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
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
  <Route path="profile" element={<Profile />} />
  <Route path="settings" element={<Settings />} />
        
        {/* Syllabus routes for instructors */}
        <Route path="syllabi" element={<SyllabiList />} />
        <Route 
          path="syllabi/upload" 
          element={
            <ProtectedRoute requiredRoles={['instructor', 'admin']}>
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
        
  {/* AI Challenger removed from global routes; use per-syllabus panel instead */}
        
        {/* Admin routes */}
        <Route
          path="admin"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/users"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <UserManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/analytics"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <Reports />
            </ProtectedRoute>
          }
        />

        {/* Manager routes */}
        <Route
          path="manager"
          element={
            <ProtectedRoute requiredRoles={['manager', 'admin']}>
              <ManagerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="manager/reports"
          element={
            <ProtectedRoute requiredRoles={['manager', 'admin']}>
              <Reports />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* 404 route */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
