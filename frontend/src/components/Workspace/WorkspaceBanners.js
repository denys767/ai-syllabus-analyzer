import React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { S } from '../../strings';

// Перебудова v4 доступна власнику; canMutate=false у старому View означає лише блокування v5-дій.
const WorkspaceBanners = ({ syllabus, busy, onRebuild, onUploadAgain }) => {
  if (!syllabus) return null;
  if (syllabus.needsRebuild) return <Alert severity="warning" sx={{ borderRadius: 0 }} action={onRebuild && <Button color="inherit" size="small" disabled={busy} onClick={onRebuild}>{S.rebuild}</Button>}>{S.rebuildBanner}</Alert>;
  if (syllabus.legacy) return <Alert severity="warning" action={<Button color="inherit" onClick={onUploadAgain}>{S.uploadAgain}</Button>}>{S.legacyBanner}</Alert>;
  if (syllabus.canMutate === false) return <Alert severity="info" sx={{ borderRadius: 0 }}>{S.readOnlyBanner}</Alert>;
  return null;
};
export default WorkspaceBanners;
