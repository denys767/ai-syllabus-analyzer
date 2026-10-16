import React from 'react';
import { Alert, Button } from '@mui/material';

// Банери над чатом: конвертація формату (PDF, DOC), старий (read-only) силабус, підтверджена відправка.
const WorkspaceBanners = ({ syllabus, onUploadAgain }) => {
  if (!syllabus) return null;
  return (
    <>
      {syllabus.convertedFrom === 'pdf' && (
        <Alert severity="info" sx={{ borderRadius: 0 }}>
          Ваш PDF збережено: у файлі «Оригінальний PDF з примітками» зміни показано примітками на оригіналі. Для редагованої версії з форматуванням завантажте DOCX.
        </Alert>
      )}
      {syllabus.convertedFrom === 'doc' && (
        <Alert severity="info" sx={{ borderRadius: 0 }}>Файл .doc сконвертовано у .docx</Alert>
      )}
      {syllabus.canMutate === false && !syllabus.legacy && syllabus.status !== 'submitted' && (
        <Alert severity="info" sx={{ borderRadius: 0 }}>
          Режим перегляду: рішення в чаті може приймати лише власник силабуса.
        </Alert>
      )}
      {syllabus.legacy && (
        <Alert
          severity="warning"
          sx={{ borderRadius: 0 }}
          action={<Button color="inherit" size="small" onClick={onUploadAgain}>Завантажити знову</Button>}
        >
          Це силабус зі старої версії системи: чат доступний лише для читання. Щоб отримати пропозиції зі
          збереженням форматування, завантажте файл знову.
        </Alert>
      )}
    </>
  );
};

export default WorkspaceBanners;
