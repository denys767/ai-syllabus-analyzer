import React, { useMemo, useState } from 'react';
import { Box, Button, Container, Divider, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import DiffText from '../components/Workspace/diff/DiffText';
import BlockChangeList from '../components/Workspace/diff/BlockChangeList';
import SuggestionCard from '../components/Workspace/suggestions/SuggestionCard';
import ChoiceCard from '../components/Workspace/suggestions/ChoiceCard';
import QuestionCard from '../components/Workspace/suggestions/QuestionCard';
import SubmissionCta from '../components/Workspace/messages/SubmissionCta';
import TextMessage from '../components/Workspace/messages/TextMessage';
import WorkspaceSidePanel from '../components/Workspace/WorkspaceSidePanel';
import DocumentPreviewDialog from '../components/Workspace/DocumentPreviewDialog';
import AnalysisProgress from '../components/Workspace/AnalysisProgress';
import WorkspaceBanners from '../components/Workspace/WorkspaceBanners';
import * as fx from '../mocks/chatV3';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const Section = ({ title, children }) => (
  <Box sx={{ mb: 4 }}>
    <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
    {children}
    <Divider sx={{ mt: 3 }} />
  </Box>
);

// Лише для розробки (/dev/cards): усі види карток і diff-компонентів на фікстурах, без бекенду.
const DevCards = () => {
  const [dark, setDark] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [suggestions, setSuggestions] = useState(fx.allSuggestions);
  const [log, setLog] = useState([]);
  const [conflictShown, setConflictShown] = useState(false);

  const theme = useMemo(() => createTheme({
    palette: {
      mode: dark ? 'dark' : 'light',
      primary: { main: '#00665a' },
      background: { default: dark ? '#0a0a0a' : '#f8fafc', paper: dark ? '#1a1a1a' : '#ffffff' },
    },
  }), [dark]);

  const patch = (id, changes) => setSuggestions((list) => list.map((s) => (s.id === id ? { ...s, ...changes } : s)));
  const note = (text) => setLog((l) => [`${new Date().toLocaleTimeString()} ${text}`, ...l].slice(0, 8));

  // Імітація мутацій сервера: оновлює локальний стан і повертає { ok }.
  const actions = {
    accept: async (id, body) => {
      await wait(400);
      const s = suggestions.find((x) => x.id === id);
      if (s?.conflictsWith?.length && !conflictShown && body.conflictResolution !== 'replacePrevious') {
        setConflictShown(true);
        return { ok: false, code: 'SUGGESTION_CONFLICT', conflicts: s.conflictsWith, error: 'Конфлікт' };
      }
      patch(id, { status: 'accepted', selectedOptionId: body.optionId || null, conflictsWith: [] });
      note(`accept ${id} ${JSON.stringify(body)}`);
      return { ok: true };
    },
    reject: async (id, body) => {
      await wait(400);
      const s = suggestions.find((x) => x.id === id);
      if (s?.requiresReason && !body.reason) return { ok: false, error: 'Потрібна причина' };
      patch(id, { status: 'rejected', decisionReason: body.reason || null, rejectTag: body.rejectTag || null });
      note(`reject ${id} ${JSON.stringify(body)}`);
      return { ok: true };
    },
    refine: async (id, body) => {
      await wait(800);
      note(`refine ${id} ${JSON.stringify(body)}`);
      patch(id, { conflictsWith: [] });
      return { ok: true };
    },
    answer: async (id, answer) => {
      await wait(800);
      patch(id, { kind: 'edit', applicable: true, changes: [fx.changeReplace] });
      note(`answer ${id}: ${answer}`);
      return { ok: true };
    },
    reopen: async (id) => {
      await wait(300);
      patch(id, { status: 'pending', decisionReason: null, rejectTag: null });
      note(`reopen ${id}`);
      return { ok: true };
    },
  };

  const byId = (id) => suggestions.find((s) => s.id === id);
  const card = (id) => {
    const s = byId(id);
    const Card = { edit: SuggestionCard, choice: ChoiceCard, question: QuestionCard }[s.kind];
    return <Card key={id} suggestion={s} actions={actions} busy={false} />;
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h4">Dev: картки пропозицій v3</Typography>
          <FormControlLabel control={<Switch checked={dark} onChange={(e) => setDark(e.target.checked)} />} label="Темна тема" />
        </Stack>

        <Section title="DiffText">
          <Typography variant="body2" component="div"><DiffText parts={fx.diffInline} /></Typography>
        </Section>

        <Section title="BlockChangeList (заголовок, пункт, клітинка, вставка, видалення, великий rewrite)">
          <BlockChangeList
            changes={[fx.changeHeading, fx.changeListItem, fx.changeTableCell, fx.changeInserted, fx.changeDeleted, fx.changeHeavy]}
          />
        </Section>

        <Section title="SuggestionCard: критична порада без правки (applicable:false)">{card('s4')}</Section>
        <Section title="SuggestionCard: high, потрібна причина відхилення">{card('s1')}</Section>
        <Section title="SuggestionCard: різні типи блоків">{card('s2')}</Section>
        <Section title="SuggestionCard: великий rewrite (до/після)">{card('s3')}</Section>
        <Section title="SuggestionCard: конфлікт з прийнятою (Прийняти → діалог конфлікту)">{card('s5')}</Section>
        <Section title="SuggestionCard: прийнято / відхилено (згорнуті)">{card('s6')}{card('s7')}</Section>
        <Section title="ChoiceCard">{card('s8')}</Section>
        <Section title="QuestionCard (після відповіді стає edit)">{card('s9')}</Section>

        <Section title="Повідомлення">
          <TextMessage message={fx.messages[0]} />
          <TextMessage message={fx.messages[2]} />
          <SubmissionCta message={fx.messages[3]} pendingCount={0} onPreview={() => setDocOpen(true)} onSubmit={() => note('submit')} />
          <SubmissionCta message={fx.messages[3]} pendingCount={3} onPreview={() => setDocOpen(true)} onSubmit={() => note('submit')} />
        </Section>

        <Section title="Бічна панель">
          <Box sx={{ border: '1px solid', borderColor: 'divider', display: 'inline-block' }}>
            <WorkspaceSidePanel
              readiness={fx.readiness}
              suggestions={suggestions}
              filesEnabled
              downloading=""
              canSubmit={false}
              submitted={false}
              busy={false}
              pendingCount={fx.readiness.counts.pending}
              onSelectSuggestion={(id) => note(`select ${id}`)}
              onDownload={(name) => note(`download ${name}`)}
              onPreviewDocument={() => setDocOpen(true)}
              onSubmit={() => note('submit')}
            />
          </Box>
        </Section>

        <Section title="Прогрес аналізу та банери">
          <AnalysisProgress stage="diagnose" />
          <AnalysisProgress failed error="Тест помилки" onRetry={() => {}} />
          <WorkspaceBanners syllabus={{ convertedFrom: 'pdf', legacy: true }} onUploadAgain={() => {}} />
          <WorkspaceBanners syllabus={{ convertedFrom: 'doc' }} />
        </Section>

        <Section title="Перегляд документа">
          <Button variant="outlined" onClick={() => setDocOpen(true)}>Відкрити</Button>
          <DocumentPreviewDialog open={docOpen} loading={false} blocks={fx.documentPreviewBlocks} error="" onClose={() => setDocOpen(false)} />
        </Section>

        <Typography variant="subtitle2">Журнал дій (імітація)</Typography>
        <Box component="pre" sx={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{log.join('\n') || '—'}</Box>
      </Container>
    </ThemeProvider>
  );
};

export default DevCards;
