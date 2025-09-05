import React from 'react';
import { Container, Box } from '@mui/material';
import PolicyReader from '../components/PolicyReader';

const PoliciesPage = () => {
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <PolicyReader />
      </Box>
    </Container>
  );
};

export default PoliciesPage;
