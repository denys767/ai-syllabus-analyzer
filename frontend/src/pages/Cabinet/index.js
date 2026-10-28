import React, { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import MetricsRow from './MetricsRow';
import SyllabiTab from './SyllabiTab';
import UsersTab from './UsersTab';
import ProgramsTab from './ProgramsTab';

const ADMIN_TABS = ["Syllabi", "Users", "Programmes"];
const INSTRUCTOR_TABS = ["Syllabi"];

const Cabinet = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState(0);
  const [metrics, setMetrics] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [error, setError] = useState('');

  const loadPrograms = useCallback(async () => {
    try {
      const { data } = await api.cabinet.listPrograms();
      setPrograms(data || []);
    } catch {
      setError("Could not load programmes");
    }
  }, []);

  const loadMetrics = useCallback(() => {
    api.cabinet.getMetrics().then(({ data }) => setMetrics(data)).catch(() => {});
  }, []);

  useEffect(() => {
    loadPrograms();
    loadMetrics();
  }, [loadPrograms, loadMetrics]);

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>{isAdmin ? "Administrator cabinet" : "My syllabi"}</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <MetricsRow metrics={metrics} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        {(isAdmin ? ADMIN_TABS : INSTRUCTOR_TABS).map((label) => <Tab key={label} label={label} />)}
      </Tabs>
      {tab === 0 && <SyllabiTab programs={programs} isAdmin={isAdmin} user={user} onChanged={loadMetrics} />}
      {isAdmin && tab === 1 && <UsersTab />}
      {isAdmin && tab === 2 && <ProgramsTab programs={programs} reload={loadPrograms} />}
    </Box>
  );
};

export default Cabinet;
