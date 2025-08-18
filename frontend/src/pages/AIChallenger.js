import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Alert,
  Stepper,
  Step,
  StepLabel,
  Chip,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Psychology,
  Send,
  CheckCircle,
  ExpandMore,
  LightbulbOutlined,
  SchoolOutlined,
  GroupsOutlined,
  TrendingUpOutlined,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const AIChallenger = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [answers, setAnswers] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const challengeSteps = [
    'Початок челенджу',
    'Відповіді на запитання',
    'AI аналіз',
    'Рекомендації',
  ];

  const practicalQuestions = [
    {
      id: 1,
      category: 'Практичність',
      question: 'Як ви плануєте реалізувати практичну частину цього матеріалу? Опишіть конкретні кейси чи завдання.',
      placeholder: 'Опишіть практичні завдання, кейси, проекти...',
    },
    {
      id: 2,
      category: 'Інтерактивність',
      question: 'Які інтерактивні методи ви використовуватимете для залучення студентів до процесу навчання?',
      placeholder: 'Дискусії, групові проекти, peer-to-peer навчання...',
    },
    {
      id: 3,
      category: 'Український контекст',
      question: 'Як ви адаптуєте міжнародні теорії та практики до українського бізнес-контексту?',
      placeholder: 'Місцеві кейси, українські компанії, специфіка ринку...',
    },
    {
      id: 4,
      category: 'Потреби студентів',
      question: 'Як ваш курс допоможе студентам вирішити їхні поточні професійні виклики?',
      placeholder: 'Конкретні навички, інструменти, методології...',
    },
    {
      id: 5,
      category: 'Оцінювання',
      question: 'Як ви будете оцінювати практичне застосування знань студентами?',
      placeholder: 'Проекти, презентації, кейс-стаді, портфоліо...',
    },
  ];

  useEffect(() => {
    setQuestions(practicalQuestions);
  }, []);

  const handleStartChallenge = () => {
    setCurrentStep(1);
    setAnswers([]);
    setError('');
  };

  const handleAnswerSubmit = () => {
    if (!currentAnswer.trim()) {
      setError('Будь ласка, надайте відповідь перед продовженням');
      return;
    }

    const newAnswer = {
      questionId: questions[answers.length].id,
      question: questions[answers.length].question,
      category: questions[answers.length].category,
      answer: currentAnswer.trim(),
    };

    const updatedAnswers = [...answers, newAnswer];
    setAnswers(updatedAnswers);
    setCurrentAnswer('');
    setError('');

    if (updatedAnswers.length === questions.length) {
      // Всі питання відповіджені, переходимо до аналізу
      analyzeAnswers(updatedAnswers);
    }
  };

  const analyzeAnswers = async (allAnswers) => {
    setCurrentStep(2);
    setLoading(true);

    try {
      // Симуляція AI аналізу (в реальності тут буде виклик до backend)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Генеруємо фідбек на основі відповідей
      const analysisResult = generateFeedback(allAnswers);
      setFeedback(analysisResult);
      setCurrentStep(3);
    } catch (err) {
      setError('Помилка під час аналізу відповідей');
    } finally {
      setLoading(false);
    }
  };

  const generateFeedback = (allAnswers) => {
    // Це тимчасова логіка, в реальності аналіз буде проводитися AI
    const categories = {
      'Практичність': { score: 0, feedback: [] },
      'Інтерактивність': { score: 0, feedback: [] },
      'Український контекст': { score: 0, feedback: [] },
      'Потреби студентів': { score: 0, feedback: [] },
      'Оцінювання': { score: 0, feedback: [] },
    };

    allAnswers.forEach(answer => {
      const category = answer.category;
      const answerLength = answer.answer.length;
      
      // Простий алгоритм оцінювання
      let score = Math.min(100, (answerLength / 200) * 100);
      
      // Додаткові бали за ключові слова
      const keywords = {
        'Практичність': ['кейс', 'проект', 'завдання', 'практика', 'застосування'],
        'Інтерактивність': ['дискусія', 'група', 'обговорення', 'взаємодія', 'колаборація'],
        'Український контекст': ['україна', 'український', 'місцевий', 'вітчизняний'],
        'Потреби студентів': ['навички', 'виклики', 'проблеми', 'рішення'],
        'Оцінювання': ['проект', 'презентація', 'портфоліо', 'оцінка'],
      };

      keywords[category]?.forEach(keyword => {
        if (answer.answer.toLowerCase().includes(keyword)) {
          score += 10;
        }
      });

      categories[category].score = Math.min(100, score);

      // Генеруємо рекомендації
      if (score < 50) {
        categories[category].feedback.push('Рекомендуємо більш детально розробити цей аспект');
      } else if (score < 80) {
        categories[category].feedback.push('Хороший підхід, але можна додати більше конкретики');
      } else {
        categories[category].feedback.push('Відмінний підхід! Продовжуйте в цьому напрямку');
      }
    });

    return {
      overall: Math.round(Object.values(categories).reduce((sum, cat) => sum + cat.score, 0) / 5),
      categories,
      recommendations: [
        'Інтегруйте більше українських кейсів та прикладів',
        'Розширте використання інтерактивних методів навчання',
        'Додайте практичні завдання, що відображають реальні бізнес-ситуації',
        'Врахуйте специфіку MBA студентів та їхній досвід',
      ],
    };
  };

  const handleRestart = () => {
    setCurrentStep(0);
    setAnswers([]);
    setCurrentAnswer('');
    setFeedback(null);
    setError('');
  };

  const renderStartScreen = () => (
    <Card sx={{ maxWidth: 800, mx: 'auto' }}>
      <CardContent sx={{ p: 4, textAlign: 'center' }}>
        <Psychology sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
        <Typography variant="h4" gutterBottom fontWeight="600">
          AI Челенджер
        </Typography>
        <Typography variant="h6" color="text.secondary" paragraph>
          Інтерактивний помічник для покращення практичності викладання
        </Typography>
        
        <Box sx={{ my: 4 }}>
          <Typography variant="body1" paragraph>
            AI Челенджер допоможе вам проаналізувати та покращити практичні аспекти вашого курсу.
            Ви отримаєте персоналізовані рекомендації щодо:
          </Typography>
          
          <List sx={{ maxWidth: 500, mx: 'auto' }}>
            <ListItem>
              <ListItemIcon>
                <LightbulbOutlined color="primary" />
              </ListItemIcon>
              <ListItemText primary="Практичності матеріалів та завдань" />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <GroupsOutlined color="primary" />
              </ListItemIcon>
              <ListItemText primary="Інтерактивних методів навчання" />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <SchoolOutlined color="primary" />
              </ListItemIcon>
              <ListItemText primary="Адаптації до потреб студентів" />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <TrendingUpOutlined color="primary" />
              </ListItemIcon>
              <ListItemText primary="Українського контексту в навчанні" />
            </ListItem>
          </List>
        </Box>

        <Typography variant="body2" color="text.secondary" paragraph>
          Час проходження: 15-20 хвилин
        </Typography>

        <Button
          variant="contained"
          size="large"
          onClick={handleStartChallenge}
          sx={{ mt: 2, px: 4 }}
        >
          Почати челендж
        </Button>
      </CardContent>
    </Card>
  );

  const renderQuestionScreen = () => {
    const currentQuestion = questions[answers.length];
    const progress = (answers.length / questions.length) * 100;

    return (
      <Card sx={{ maxWidth: 800, mx: 'auto' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Chip 
                label={currentQuestion.category} 
                color="primary" 
                variant="outlined" 
              />
              <Typography variant="body2" color="text.secondary">
                {answers.length + 1} з {questions.length}
              </Typography>
            </Box>
            <LinearProgress variant="determinate" value={progress} sx={{ mb: 2 }} />
          </Box>

          <Typography variant="h6" gutterBottom>
            {currentQuestion.question}
          </Typography>

          <TextField
            fullWidth
            multiline
            rows={6}
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            placeholder={currentQuestion.placeholder}
            variant="outlined"
            sx={{ my: 3 }}
          />

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button
              variant="outlined"
              onClick={() => setCurrentStep(0)}
            >
              Скасувати
            </Button>
            <Button
              variant="contained"
              onClick={handleAnswerSubmit}
              endIcon={<Send />}
              disabled={!currentAnswer.trim()}
            >
              {answers.length === questions.length - 1 ? 'Завершити' : 'Далі'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  };

  const renderAnalysisScreen = () => (
    <Card sx={{ maxWidth: 800, mx: 'auto' }}>
      <CardContent sx={{ p: 4, textAlign: 'center' }}>
        <Psychology sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          AI аналізує ваші відповіді...
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Це може зайняти кілька хвилин
        </Typography>
        <LinearProgress sx={{ my: 3 }} />
      </CardContent>
    </Card>
  );

  const renderFeedbackScreen = () => (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <CheckCircle sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
          <Typography variant="h4" gutterBottom>
            Аналіз завершено!
          </Typography>
          <Typography variant="h6" color="text.secondary">
            Загальний бал: {feedback.overall}/100
          </Typography>
        </CardContent>
      </Card>

      {/* Детальний аналіз по категоріях */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Аналіз по категоріях
          </Typography>
          
          {Object.entries(feedback.categories).map(([category, data]) => (
            <Accordion key={category} sx={{ mb: 1 }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <Typography variant="subtitle1" sx={{ flex: 1 }}>
                    {category}
                  </Typography>
                  <Chip 
                    label={`${data.score}/100`} 
                    color={data.score >= 80 ? 'success' : data.score >= 60 ? 'warning' : 'error'}
                    size="small"
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {data.feedback.map((item, index) => (
                  <Typography key={index} variant="body2" color="text.secondary">
                    • {item}
                  </Typography>
                ))}
              </AccordionDetails>
            </Accordion>
          ))}
        </CardContent>
      </Card>

      {/* Рекомендації */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Рекомендації для покращення
          </Typography>
          <List>
            {feedback.recommendations.map((rec, index) => (
              <ListItem key={index}>
                <ListItemIcon>
                  <LightbulbOutlined color="primary" />
                </ListItemIcon>
                <ListItemText primary={rec} />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>

      <Box sx={{ textAlign: 'center' }}>
        <Button
          variant="contained"
          onClick={handleRestart}
          sx={{ mx: 1 }}
        >
          Пройти знову
        </Button>
        <Button
          variant="outlined"
          onClick={() => setCurrentStep(0)}
          sx={{ mx: 1 }}
        >
          На головну
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom textAlign="center" fontWeight="600">
        AI Челенджер
      </Typography>
      
      <Stepper activeStep={currentStep} sx={{ mb: 4, maxWidth: 600, mx: 'auto' }}>
        {challengeSteps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {currentStep === 0 && renderStartScreen()}
      {currentStep === 1 && renderQuestionScreen()}
      {currentStep === 2 && loading && renderAnalysisScreen()}
      {currentStep === 3 && feedback && renderFeedbackScreen()}
    </Box>
  );
};

export default AIChallenger;
