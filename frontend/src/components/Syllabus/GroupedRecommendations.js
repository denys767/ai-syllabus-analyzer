import React from 'react';
import { Box, Typography, Paper, Stack, Chip, Divider } from '@mui/material';

const Section = ({ title, items = [], fallback }) => (
  <Paper variant="outlined" sx={{ p: 2 }}>
    <Typography variant="subtitle1" gutterBottom>{title}</Typography>
    {(items && items.length > 0) ? (
      <Stack spacing={0.75}>
        {items.map((t, i) => (
          <Typography key={i} variant="body2">• {t}</Typography>
        ))}
      </Stack>
    ) : (
      <Typography variant="body2" color="text.secondary">{fallback}</Typography>
    )}
  </Paper>
);

export default function GroupedRecommendations({ syllabus }) {
  const analysis = syllabus.analysis || {};
  const sca = analysis.studentClusterAnalysis || {};
  const survey = analysis.surveyInsights || {};

  // Reproduce server grouping logic on client for immediate UI
  const surveyBased = [];
  if (Array.isArray(survey.commonChallenges) && survey.commonChallenges.length) {
    surveyBased.push(`Адресувати поширені виклики: ${survey.commonChallenges.slice(0,5).map(x=>x.theme||x).join(', ')}`);
  }
  if (Array.isArray(survey.decisionTypes) && survey.decisionTypes.length) {
    surveyBased.push(`Включити приклади рішень: ${survey.decisionTypes.slice(0,5).map(x=>x.theme||x).join(', ')}`);
  }
  if (Array.isArray(survey.learningPreferences) && survey.learningPreferences.length) {
    surveyBased.push('Налаштувати формат під вподобання навчання (кейси, дискусії, hands-on).');
  }

  const clusterAndUACases = [
    ...((Array.isArray(sca.adaptationRecommendations)? sca.adaptationRecommendations: [])).map(a => typeof a === 'string' ? a : (a.title || a.recommendation || JSON.stringify(a))),
    ...((Array.isArray(sca.suggestedCases)? sca.suggestedCases: []).slice(0,6).map(c => `Додати український кейс: ${c.company || c.title} (${c.cluster || '—'})`))
  ];

  const plagiarism = [];
  const plag = analysis.plagiarismCheck || {};
  if (Array.isArray(plag.similarSyllabi) && plag.similarSyllabi.length) {
    const top = plag.similarSyllabi[0];
    plagiarism.push(`Виявлено схожість із силабусом ${top.instructor || 'іншого викладача'} (${top.course || ''}, ${top.year||''}) на ${top.similarity}% — рекомендуємо переробити проблемні розділи, додати оригінальні кейси та завдання.`);
  }

  const learningObjectives = [];
  const loa = analysis.learningObjectivesAlignment || {};
  if (Array.isArray(loa.missingObjectives) && loa.missingObjectives.length) learningObjectives.push(`Компенсувати прогалини ILO: ${loa.missingObjectives.slice(0,6).join(', ')}`);
  if (Array.isArray(loa.recommendations) && loa.recommendations.length) learningObjectives.push(...loa.recommendations.slice(0,6));

  const templateCompliance = [];
  const tc = analysis.templateCompliance || {};
  if (Array.isArray(tc.missingElements) && tc.missingElements.length) templateCompliance.push(`Додати відсутні елементи шаблону: ${tc.missingElements.slice(0,8).join(', ')}`);
  if (Array.isArray(tc.recommendations) && tc.recommendations.length) templateCompliance.push(...tc.recommendations.slice(0,6));

  const aiChallenger = [];
  const disc = Array.isArray(syllabus.practicalChallenge?.discussion) ? syllabus.practicalChallenge.discussion : [];
  const sug = Array.isArray(syllabus.practicalChallenge?.aiSuggestions) ? syllabus.practicalChallenge.aiSuggestions : [];
  aiChallenger.push(...disc.slice(-3).map(d => (d.aiResponse || '').slice(0,200)).filter(Boolean));
  aiChallenger.push(...sug.slice(0,5).map(s => s.suggestion));

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Згруповані рекомендації</Typography>
      <Stack spacing={2}>
        <Section title="Рекомендації за результатами опитування" items={surveyBased} fallback="Немає даних опитування" />
        <Section title="Рекомендації щодо інтеграції українських кейсів та практичних завдань" items={clusterAndUACases} fallback="Немає рекомендацій по кластерам/кейсам" />
        <Section title="Попередження щодо плагіату та відрекомендовані зміни" items={plagiarism} fallback="Суттєвої схожості не виявлено" />
        <Section title="Рекомендації за відповідністю до Learning Objectives" items={learningObjectives} fallback="Немає додаткових рекомендацій по ILO" />
        <Section title="Рекомендації за відповідністю до шаблону" items={templateCompliance} fallback="Шаблон здебільшого виконано" />
        <Section title="Рекомендації за відповідями на AI‑челенджер" items={aiChallenger} fallback="Немає збережених порад від AI‑челенджера" />
      </Stack>
    </Box>
  );
}
