import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Collapse, Stack, Typography } from '@mui/material';
import { ExpandLess, ExpandMore, Slideshow, WarningAmber } from '@mui/icons-material';

const SlideImage = ({ title, src }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary">{title}</Typography>
    <Box
      component="img"
      src={src}
      alt={title}
      sx={{ display: 'block', width: '100%', height: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: '#fff' }}
    />
  </Box>
);

// Розділ «Слайди до / після» для PPTX: PNG-пари вантажаться при першому розгортанні.
// resetKey змінюється після Refine, щоб не показувати застарілі зображення.
const SlidesSection = ({ loadSlides, optionId = null, resetKey = '' }) => {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: false, slides: null, error: '' });
  const requestRef = useRef(0);

  useEffect(() => {
    requestRef.current += 1;
    setState({ loading: false, slides: null, error: '' });
    setOpen(false);
  }, [resetKey, optionId]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setState({ loading: true, slides: null, error: '' });
    const result = await loadSlides(optionId);
    if (request !== requestRef.current) return;
    setState(result.ok
      ? { loading: false, slides: result.slides, error: '' }
      : { loading: false, slides: null, error: result.error || 'Не вдалося завантажити слайди' });
  }, [loadSlides, optionId]);

  const toggle = (e) => {
    e.stopPropagation();
    const next = !open;
    setOpen(next);
    if (next && !state.slides && !state.loading) load();
  };

  return (
    <Box sx={{ mt: 1.5 }} onClick={(e) => e.stopPropagation()}>
      <Button
        size="small"
        startIcon={<Slideshow />}
        endIcon={open ? <ExpandLess /> : <ExpandMore />}
        onClick={toggle}
      >
        Слайди до / після
      </Button>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ mt: 1 }}>
          {state.loading && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">Готуємо зображення слайдів…</Typography>
            </Stack>
          )}
          {state.error && (
            <Alert
              severity="warning"
              action={<Button color="inherit" size="small" onClick={load}>Повторити</Button>}
            >
              {state.error}
            </Alert>
          )}
          {state.slides && !state.slides.length && (
            <Typography variant="body2" color="text.secondary">Ця пропозиція не змінює вигляд слайдів.</Typography>
          )}
          {state.slides && state.slides.length > 0 && (
            <Stack spacing={2}>
              {state.slides.map((slide) => (
                <Box key={slide.slide}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="subtitle2">Слайд {slide.slide}</Typography>
                    {slide.overflowRisk && (
                      <Chip size="small" color="warning" icon={<WarningAmber />} label="Текст може не вміститися" />
                    )}
                  </Stack>
                  <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                    <SlideImage title="До" src={slide.before} />
                    <SlideImage title="Після" src={slide.after} />
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

export default SlidesSection;
