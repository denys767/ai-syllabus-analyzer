import React from 'react';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
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
