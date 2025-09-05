import React, { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Paper, CircularProgress, Alert, Table, TableHead, TableRow, TableCell, TableBody, IconButton, Stack, TextField, Chip } from '@mui/material';
import { Visibility } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function ReportsCatalog(){
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const resp = await api.reports.getCatalog();
      setItems(resp.data.items || []);
    } catch(e){
      setError(e.response?.data?.message || 'Не вдалося завантажити каталог');
    } finally { setLoading(false); }
  }, []);

  useEffect(()=> { load(); }, [load]);

  const filtered = items.filter(i => !query || i.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <Box sx={{ p:3 }}>
      <Stack direction={{ xs:'column', sm:'row' }} spacing={2} alignItems={{ sm:'center' }} justifyContent="space-between" sx={{ mb:2 }}>
        <Typography variant="h5">Каталог звітів силабусів</Typography>
        <TextField size="small" placeholder="Пошук..." value={query} onChange={e=> setQuery(e.target.value)} />
      </Stack>
      {loading && <CircularProgress />}
      {error && <Alert severity="error" sx={{ mb:2 }}>{error}</Alert>}
      {!loading && !error && (
        <Paper sx={{ overflowX:'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Назва</TableCell>
                <TableCell>Курс код</TableCell>
                <TableCell>Викладач</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Прийнято</TableCell>
                <TableCell>Очікує</TableCell>
                <TableCell>Прогалини шаблону</TableCell>
                <TableCell>Прогалини ILO</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(row => (
                <TableRow key={row.id} hover onClick={()=> navigate(`/syllabi/${row.id}`)} style={{ cursor:'pointer' }}>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>{row.course?.code}</TableCell>
                  <TableCell>{row.instructor?.name}</TableCell>
                  <TableCell><Chip label={row.status} size="small" /></TableCell>
                  <TableCell>{row.acceptedCount}</TableCell>
                  <TableCell>{row.pendingCount}</TableCell>
                  <TableCell>{row.missingTemplate}</TableCell>
                  <TableCell>{row.missingILO}</TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={()=> navigate(`/syllabi/${row.id}`)}><Visibility fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={9}><Typography variant="body2" color="text.secondary">Немає збігів.</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
