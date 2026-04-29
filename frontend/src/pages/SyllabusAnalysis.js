import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

export default function SyllabusAnalysis() {
  const { id } = useParams();
  return <Navigate to={id ? `/dashboard?syllabus=${id}` : '/dashboard'} replace />;
}
