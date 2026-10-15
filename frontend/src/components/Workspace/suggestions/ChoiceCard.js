import React, { useEffect, useState } from 'react';
import { Box, Radio, Stack, Typography } from '@mui/material';
import SuggestionFrame from './SuggestionFrame';
import BlockChangeList from '../diff/BlockChangeList';

// kind = 'choice': кілька варіантів, кожен зі своїм diff. Приймається обраний (optionId).
const ChoiceCard = ({ suggestion, ...frameProps }) => {
  const options = suggestion.options || [];
  const pending = suggestion.status === 'pending';
  const [selected, setSelected] = useState(suggestion.selectedOptionId || null);

  useEffect(() => {
    setSelected(suggestion.selectedOptionId || null);
  }, [suggestion.selectedOptionId, suggestion.id]);

  // Для прийнятої пропозиції показуємо лише обраний варіант
  const visible = pending ? options : options.filter((o) => o.id === suggestion.selectedOptionId);

  return (
    <SuggestionFrame
      suggestion={suggestion}
      acceptOptionId={selected}
      acceptDisabled={!selected}
      {...frameProps}
    >
      <Stack spacing={1.5}>
        {visible.map((option) => {
          const isSelected = selected === option.id;
          return (
            <Box
              key={option.id}
              onClick={() => pending && setSelected(option.id)}
              sx={{
                p: 1.5,
                border: '1px solid',
                borderColor: isSelected ? 'primary.main' : 'divider',
                borderRadius: 1,
                cursor: pending ? 'pointer' : 'default',
                bgcolor: isSelected && pending ? 'action.selected' : 'transparent',
              }}
            >
              <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                {pending && (
                  <Radio
                    size="small"
                    checked={isSelected}
                    onChange={() => setSelected(option.id)}
                    inputProps={{ 'aria-label': option.label }}
                    sx={{ mt: -0.5, ml: -1 }}
                  />
                )}
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2">{option.label}</Typography>
                  {option.rationale && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {option.rationale}
                    </Typography>
                  )}
                  <BlockChangeList changes={option.changes} />
                </Box>
              </Stack>
            </Box>
          );
        })}
        {!visible.length && (
          <Typography variant="body2" color="text.secondary">Варіантів немає.</Typography>
        )}
      </Stack>
    </SuggestionFrame>
  );
};

export default ChoiceCard;
