const Syllabus = require('../models/Syllabus');
const { Survey, SurveyResponse } = require('../models/Survey');
const StudentCluster = require('../models/StudentCluster');
const natural = require('natural');
const OpenAI = require('openai');

class AIService {
  constructor() {
    this.stemmer = natural.PorterStemmer;
    this.tfidf = new natural.TfIdf();
    
    // Initialize OpenAI from environment (no explicit per-request timeout)
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Get LLM model from environment with safe default
    const envModel = (process.env.LLM_MODEL || '').trim();
    const defaultModel = 'gpt-5-nano';
    this.llmModel = envModel && envModel.startsWith('gpt-') ? envModel : defaultModel;
    
    // Define static templates and objectives (unchanging)
    this.initializeStaticContent();
  }

  // Extract plain text from Responses API response structure
  extractResponsesText(resp) {
    if (!resp) return '';
    // New SDK may expose output_text
    if (resp.output_text) return resp.output_text.trim();
    // Fallback manual extraction
    try {
      const parts = [];
      if (Array.isArray(resp.output)) {
        for (const item of resp.output) {
          if (item.content) {
            for (const c of item.content) {
              if (c.type === 'output_text' && c.text?.value) parts.push(c.text.value);
              else if (c.text?.value) parts.push(c.text.value);
            }
          }
        }
      }
      return parts.join('\n').trim();
    } catch {
      return '';
    }
  }

  // Safely parse JSON output from the model, tolerating code fences or trailing commas
  safeParseJSON(text) {
    if (!text || typeof text !== 'string') return null;
    // Remove Markdown code fences if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
    }
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      try {
        // Attempt minor fixes: remove trailing commas
        const noTrailingCommas = cleaned.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(noTrailingCommas);
      } catch {
        console.error('safeParseJSON failed. Text was:', text);
        return null;
      }
    }
  }

  initializeStaticContent() {
    // MBA Syllabus Template (static, unchanging)
    this.syllabusTemplate = `
📌  ROLE  
You are **MBA Syllabus Mentor** for Kyiv School of Economics – Graduate Business School (KSE GBS).  
Act strictly as a mentor, challenger, and quality guardian; never replace the instructor's work.

📂  KNOWLEDGE FILES  
• "MBA_Student_Cluster_Analysis.md" – clustered profile of the current MBA cohort.  
• The syllabus uploaded by the user.

🌐  DEFAULT LANGUAGE — EN-US

────────────────────────────  WORKFLOW  ────────────────────────────

0. **Executive Overview** – ≤ 200 words.

0b. **Strengths & Gaps Snapshot** – Top-3 + Top-3 (bullets).

1. **Format Compliance** – bullets per block (✅ / ⚠️ / ❌).

2. **ILO Coverage** – bullets with Score + Bloom + Justification.

2a. **ILO ↔ Assessment Map** – bullets.

3. **Audience Fit**  *(bullet list per weekly topic)*  
   Student clusters (fixed):  
     1 Technology Leaders 2 Finance/Banking 3 Military/Public 4 Business Ops & Mgmt  

   For **each topic** output:  
   • **Topic:** <title>  
     – **Primary Cluster:** <1-4> – **Fit:** <0-5>  
     – **Why it matters:** ≤ 20 words  
     – **Gap / Enhancement:** ≤ 40 chars or "None"  
     – **Hook:** <provocative question / micro-task, ≤ 15 words>  
       **Hook Benefit:** <how the instructor can use it, ≤ 15 words>  
   • Prefix 🟥 **Low Relevance** if Fit ≤ 2 for all clusters.

4. **Practicality Boost**  *(table)*  
   | Intervention | Description ≤ 20 words | Target Clusters 1-4 | Expected Benefit |

4a. **Case Library**  *(table)*  
   | Case Title | Source/link placeholder | Primary Topic | Cluster(s) | Key Learning Point |

5. **Action Plan**  *(table, sorted High-Impact → Low)*  
   | Task | Owner | Deadline | Impact/Effort tag |

────────────────────────────  OUTPUT STYLE  ────────────────────────────
• Markdown headings (##), no deeper than H3.  
• Steps 1-3 use bullet formats exactly as above; steps 4-5 may stay tables.  
• Tone: constructive, succinct, supportive.  
• No extra sections beyond those specified.
    `;

    // MBA Learning Objectives (static, unchanging)
    this.mbaLearningObjectives = `
MBA-27 Learning Objectives for Kyiv School of Economics:

1. **Strategic Thinking & Analysis**
   - Develop strategic vision and long-term planning capabilities
   - Analyze complex business environments and competitive dynamics
   - Make data-driven strategic decisions under uncertainty

2. **Leadership & Team Management**
   - Lead and motivate diverse teams in dynamic environments
   - Build organizational culture and manage change effectively
   - Develop emotional intelligence and interpersonal skills

3. **Financial Analysis & Decision Making**
   - Perform advanced financial modeling and valuation
   - Understand capital markets and investment strategies
   - Manage financial risks and optimize capital structure

4. **Marketing Strategy & Consumer Behavior**
   - Develop comprehensive marketing strategies and brand management
   - Analyze consumer behavior and market research data
   - Design digital marketing campaigns and customer acquisition strategies

5. **Operations & Supply Chain Management**
   - Optimize business processes and operational efficiency
   - Design and manage global supply chains
   - Implement quality management and lean methodologies

6. **Data Analysis & Business Intelligence**
   - Apply statistical methods and data analytics to business problems
   - Use business intelligence tools for decision support
   - Understand machine learning applications in business

7. **Entrepreneurship & Innovation**
   - Identify and evaluate business opportunities
   - Develop business models and startup strategies
   - Foster innovation and creative problem-solving

8. **Ethics & Corporate Responsibility**
   - Apply ethical frameworks to business decisions
   - Understand corporate social responsibility and sustainability
   - Navigate legal and regulatory environments

9. **Global Business & Cultural Awareness**
   - Understand international business and global markets
   - Navigate cross-cultural business environments
   - Develop cultural intelligence and global mindset

10. **Digital Transformation & Technology**
    - Understand emerging technologies and their business applications
    - Lead digital transformation initiatives
    - Leverage technology for competitive advantage
    `;

    console.log('✅ Static content initialized successfully');
  }

  async analyzeSyllabus(syllabusId) {
    try {
      console.log(`Starting comprehensive AI analysis for syllabus ${syllabusId}`);
      
      const syllabus = await Syllabus.findById(syllabusId);
      if (!syllabus) {
        throw new Error('Syllabus not found');
      }

      // Get current student cluster data (changes quarterly)
      const currentStudentClusters = await this.getCurrentStudentClusters();
      
      // Get latest survey responses for context
      const surveyInsights = await this.getSurveyInsights();

      // Perform comprehensive analysis using OpenAI
      const analysis = await this.performComprehensiveAnalysis(
        syllabus.extractedText, 
        currentStudentClusters, 
        surveyInsights
      );

      // Check for plagiarism against existing syllabi
      const plagiarismCheck = await this.checkPlagiarism(syllabus);

      // Update syllabus with complete analysis results (aligned with model)
      await Syllabus.findByIdAndUpdate(syllabusId, {
        structure: analysis.structure,
        analysis: {
          templateCompliance: analysis.templateCompliance,
          learningObjectivesAlignment: analysis.learningObjectivesAlignment,
          studentClusterAnalysis: analysis.studentClusterAnalysis,
          plagiarismCheck: plagiarismCheck,
          // Persist survey insights if present for downstream reporting
          surveyInsights: analysis.surveyInsights || undefined
        },
        recommendations: analysis.recommendations,
        vectorEmbedding: this.generateVectorEmbedding(syllabus.extractedText),
        status: 'analyzed'
      });

      console.log(`Comprehensive AI analysis completed for syllabus ${syllabusId}`);
      return true;

    } catch (error) {
      console.error(`AI analysis failed for syllabus ${syllabusId}:`, error);
      // Persist error state so UI can reflect failure
      try {
        await Syllabus.findByIdAndUpdate(syllabusId, {
          status: 'error'
        });
      } catch (persistErr) {
        console.error('Failed to persist error status for syllabus', syllabusId, persistErr);
      }
      throw error;
    }
  }

  async performComprehensiveAnalysis(syllabusText, studentClusters, surveyInsights) {
  const prompt = `
Виконай комплексний аналіз силабусу MBA курсу на основі наступних критеріїв:

ШАБЛОН СИЛАБУСУ:
${this.syllabusTemplate}

НАВЧАЛЬНІ ЦІЛІ MBA-27:
${this.mbaLearningObjectives}

ПОТОЧНІ КЛАСТЕРИ СТУДЕНТІВ:
${JSON.stringify(studentClusters, null, 2)}

РЕЗУЛЬТАТИ ОПИТУВАНЬ СТУДЕНТІВ:
${JSON.stringify(surveyInsights, null, 2)}

СИЛАБУС ДЛЯ АНАЛІЗУ:
${syllabusText}

Надай детальний аналіз у JSON форматі з наступними секціями:

1. **templateCompliance**: 
   - score: 0-100 (відповідність шаблону)
   - missingElements: []
   - recommendations: []

2. **learningObjectivesAlignment**:
   - overallScore: 0-100
   - coveredObjectives: []
   - missingObjectives: []
   - recommendations: []

3. **studentClusterAnalysis**:
   - clusterRelevance: {cluster: relevanceScore}
   - suggestedCases: [] (українські кейси з OpenAI пошуку)
   - adaptationRecommendations: []

4. **surveyInsights**:
   - addressedChallenges: []
   - missedOpportunities: []
   - recommendations: []

5. **structure**:
   - hasObjectives: boolean
   - hasAssessment: boolean
   - hasSchedule: boolean
   - hasResources: boolean
   - completenessScore: 0-100

6. **recommendations**: [] (загальні рекомендації з пріоритетами)

Використовуй функцію пошуку для знаходження релевантних українських бізнес-кейсів для кожного кластера студентів.

Відповідь має бути виключно у форматі JSON без додаткового тексту.
`;
    const response = await this.openai.responses.create({
      model: this.llmModel,
      input: [
        { role: 'system', content: "Ти експерт з аналізу навчальних програм MBA в Kyiv School of Economics. Відповідай виключно у форматі дійсного JSON-об'єкта без кодових блоків. Використовуй українську мову для рекомендацій." },
        { role: 'user', content: prompt }
      ],
      text: {"format": {"type": "json_object"}}
    });

    const raw = (response.output_text || this.extractResponsesText(response) || '').trim();
    const analysisResult = this.safeParseJSON(raw);
    if (!analysisResult || Object.keys(analysisResult).length === 0) {
      throw new Error('Empty or invalid JSON from model');
    }

    // Enhance with Ukrainian case studies using search
    const enhancedCases = await this.searchUkrainianCases(studentClusters, syllabusText);
    if (!analysisResult.studentClusterAnalysis) {
      analysisResult.studentClusterAnalysis = {};
    }
    analysisResult.studentClusterAnalysis.suggestedCases = [
      ...(analysisResult.studentClusterAnalysis.suggestedCases || []),
      ...enhancedCases
    ];

    // Normalize to match Syllabus model shape
    return this.normalizeAnalysisForModel(analysisResult);
  }

  // Removed basicAnalysis fallback; failures now surface and mark syllabus status as 'error'

  analyzeBasicStructure(text) {
    const lowerText = text.toLowerCase();
    
    return {
      hasObjectives: lowerText.includes('objectives') || lowerText.includes('цілі') || lowerText.includes('мета'),
      hasAssessment: lowerText.includes('assessment') || lowerText.includes('оцінювання') || lowerText.includes('іспит'),
      hasSchedule: lowerText.includes('schedule') || lowerText.includes('розклад') || lowerText.includes('календар'),
      hasResources: lowerText.includes('resources') || lowerText.includes('література') || lowerText.includes('джерела'),
      completenessScore: Math.min(100, text.length / 50), // Basic scoring
      missingParts: []
    };
  }

  formatRecommendations(recommendations) {
    if (!Array.isArray(recommendations)) return [];

    const allowedCategories = new Set(['structure', 'content', 'objectives', 'assessment', 'cases', 'methods']);
    const coerceCategory = (cat) => (allowedCategories.has(cat) ? cat : 'content');

    return recommendations.map((rec, index) => ({
      id: `rec_${index + 1}`,
      category: coerceCategory(rec.category),
      title: rec.title || `Рекомендація ${index + 1}`,
      description: typeof rec === 'string' ? rec : (rec.description || ''),
      priority: rec.priority && ['low','medium','high','critical'].includes(rec.priority) ? rec.priority : 'medium'
    }));
  }

  async getCurrentStudentClusters() {
    try {
      // Get current active clusters from database (updated quarterly)
      const currentClusters = await StudentCluster.getCurrentClusters();
      return currentClusters;
    } catch (error) {
      console.error('Error getting student clusters:', error);
      return { clusters: [] };
    }
  }

  async getSurveyInsights() {
    try {
      // Use only Google Forms-based survey (by title)
      const surveyTitle = 'Student Profiling Survey for MBA Program';
      const survey = await Survey.findOne({ title: surveyTitle });
      if (!survey) {
        return {
          totalResponses: 0,
          commonChallenges: [],
          decisionTypes: [],
          learningPreferences: []
        };
      }
      // Get recent responses for that survey
      const recentSurveys = await SurveyResponse.find({ survey: survey._id })
        .sort({ createdAt: -1 })
        .limit(100);

      if (recentSurveys.length === 0) {
        return {
          totalResponses: 0,
          commonChallenges: [],
          decisionTypes: [],
          learningPreferences: []
        };
      }

      // Map answers by questionId -> text for each response
      const qByText = new Map(survey.questions.map(q => [q.text, q]));
      const findAnswerByText = (resp, text) => {
        const q = qByText.get(text);
        if (!q) return undefined;
        const a = resp.answers.find(x => String(x.questionId) === String(q._id));
        return a ? (a.textAnswer || a.answer) : undefined;
      };

      // Known question texts (must match Google Forms / survey-info)
      const Q = {
        challenge: "Describe ONE of the biggest challenges you're facing at work right now that you believe could be solved through MBA knowledge. Be as specific as possible.",
        decisions: 'What are 2–3 types of decisions you make most frequently in your work? What makes these decisions particularly challenging?',
        situation: "Think of a situation from the past month when you thought: 'I should have known something from management/economics/strategy to handle this better.' What was that situation?",
        experience: 'In which area or function do you have experience that you could share with colleagues? And conversely - what industry/function experience would be most interesting for you to learn from?',
        learningStyle: 'How do you typically learn most effectively - through case studies, discussions, hands-on practice, or something else? And what prevents you from applying new knowledge at work?'
      };

      const challenges = recentSurveys.map(r => findAnswerByText(r, Q.challenge)).filter(Boolean);
      const decisions = recentSurveys.map(r => findAnswerByText(r, Q.decisions)).filter(Boolean);
      const learningStyles = recentSurveys.map(r => findAnswerByText(r, Q.learningStyle)).filter(Boolean);

      return {
        totalResponses: recentSurveys.length,
        lastUpdated: recentSurveys[0].createdAt,
        commonChallenges: this.extractCommonThemes(challenges),
        decisionTypes: this.extractCommonThemes(decisions), 
        learningPreferences: this.extractCommonThemes(learningStyles),
        rawInsights: {
          topChallenges: challenges.slice(0, 10),
          topDecisions: decisions.slice(0, 10),
          topLearningStyles: learningStyles.slice(0, 10)
        }
      };
    } catch (error) {
      console.error('Error getting survey insights:', error);
      return { totalResponses: 0, commonChallenges: [], decisionTypes: [], learningPreferences: [] };
    }
  }

  extractCommonThemes(textArray) {
    if (!textArray || textArray.length === 0) return [];
    
    // Simple frequency analysis of common words/phrases
    const wordFreq = {};
    textArray.forEach(text => {
      const words = text.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 3); // Filter short words
      
      words.forEach(word => {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      });
    });

    return Object.entries(wordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word, count]) => ({ theme: word, frequency: count }));
  }

  async searchUkrainianCases(studentClusters, syllabusContent) {
    try {
      const prompt = `Знайди 3-5 релевантних українських бізнес-кейсів для MBA курсу на основі наступних даних.\n\nКластери студентів: ${JSON.stringify(studentClusters.clusters, null, 2)}\nЗміст курсу (фрагмент): ${syllabusContent.substring(0, 1000)}\n\nДля кожного кейсу поверни поля: title, cluster, description, learningPoints, source, relevanceScore.\nПоверни валідний JSON тільки у форматі: {\\"cases\\": [ ... ]} без додаткового тексту.`;

      // Can't use JSON mode with web_search tool: omit text.format
      const response = await this.openai.responses.create({
        model: this.llmModel,
        tools: [{ type: 'web_search_preview' }],
        input: prompt
      });

      const raw = (response.output_text || this.extractResponsesText(response) || '').trim();
      let parsed = this.safeParseJSON(raw);
      if (!parsed) {
        // Attempt to extract first JSON object manually
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = this.safeParseJSON(match[0]);
        }
      }
      parsed = parsed || {};
      return Array.isArray(parsed.cases) ? parsed.cases : [];
    } catch (error) {
      console.error('Error searching Ukrainian cases (responses API):', error);
      return [];
    }
  }

  async checkPlagiarism(currentSyllabus) {
    try {
      // Get all other syllabi for comparison
      const otherSyllabi = await Syllabus.find({
        _id: { $ne: currentSyllabus._id },
        vectorEmbedding: { $exists: true, $ne: [] }
      }).select('_id instructor course.name course.year vectorEmbedding');

      const currentVector = this.generateVectorEmbedding(currentSyllabus.extractedText);
      const similarSyllabi = [];

      for (const syllabus of otherSyllabi) {
        if (syllabus.vectorEmbedding && syllabus.vectorEmbedding.length > 0) {
          const similarity = this.calculateCosineSimilarity(currentVector, syllabus.vectorEmbedding);
          
          if (similarity > 0.6) { // 60% similarity threshold
            try {
              const populatedSyllabus = await Syllabus.populate(syllabus, { path: 'instructor', select: 'firstName lastName' });
              
              // Check if instructor exists and has required fields
              const instructorName = populatedSyllabus.instructor && populatedSyllabus.instructor.firstName && populatedSyllabus.instructor.lastName
                ? `${populatedSyllabus.instructor.firstName} ${populatedSyllabus.instructor.lastName}`
                : 'Unknown Instructor';
              
              similarSyllabi.push({
                syllabusId: syllabus._id,
                similarity: Math.round(similarity * 100),
                instructor: instructorName,
                course: syllabus.course.name,
                year: syllabus.course.year
              });
            } catch (populateError) {
              console.error('Error populating instructor:', populateError);
              // Add syllabus with unknown instructor
              similarSyllabi.push({
                syllabusId: syllabus._id,
                similarity: Math.round(similarity * 100),
                instructor: 'Unknown Instructor',
                course: syllabus.course.name,
                year: syllabus.course.year
              });
            }
          }
        }
      }

      // Sort by similarity (highest first)
      similarSyllabi.sort((a, b) => b.similarity - a.similarity);

      // Determine uniqueness score and risk level
      const maxSimilarity = similarSyllabi.length > 0 ? similarSyllabi[0].similarity : 0;
      const uniquenessScore = Math.max(0, 100 - maxSimilarity);
      
      let riskLevel = 'low';
      if (maxSimilarity > 85) riskLevel = 'high';
      else if (maxSimilarity > 70) riskLevel = 'medium';

      return {
        similarSyllabi: similarSyllabi.slice(0, 5), // Top 5 similar syllabi
        uniquenessScore,
        riskLevel
      };

    } catch (error) {
      console.error('Plagiarism check error:', error);
      return {
        similarSyllabi: [],
        uniquenessScore: 100,
        riskLevel: 'low'
      };
    }
  }

  generateVectorEmbedding(text) {
    // Simplified TF-IDF based vector generation
    // In production, use more sophisticated embeddings like sentence-transformers
    
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .map(word => this.stemmer.stem(word));

    const wordFreq = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Get top 50 most frequent words as vector dimensions
    const topWords = Object.entries(wordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 50)
      .map(([word]) => word);

    // Create vector
    const vector = topWords.map(word => wordFreq[word] || 0);
    
    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  calculateCosineSimilarity(vectorA, vectorB) {
    if (vectorA.length !== vectorB.length) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      magnitudeA += vectorA[i] * vectorA[i];
      magnitudeB += vectorB[i] * vectorB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (magnitudeA * magnitudeB);
  }

  async startPracticalChallenge(syllabusId) {
    try {
      const syllabus = await Syllabus.findById(syllabusId).select('extractedText analysis');
      if (!syllabus) throw new Error('Syllabus not found');

      const prompt = `
        Based on the following syllabus text and analysis, generate a single, thought-provoking, open-ended question for the instructor.
        This question should challenge the instructor to think about the practical application of a key topic in their course, considering the student profile (IT, Finance, Military, Management).
        The question should be in Ukrainian.

        Syllabus Analysis:
        ${JSON.stringify(syllabus.analysis, null, 2)}

        Syllabus Text:
        ${syllabus.extractedText.substring(0, 4000)}

        Generate only the question, without any introductory text.
      `;

      const response = await this.openai.responses.create({
        model: this.llmModel,
        input: [
          { role: 'system', content: 'You are an expert academic advisor for an MBA program. Your task is to challenge instructors to improve the practical relevance of their courses.' },
          { role: 'user', content: prompt }
        ]
      });

      const initialQuestion = (response.output_text || this.extractResponsesText(response) || '').trim();

      await Syllabus.findByIdAndUpdate(syllabusId, {
        'practicalChallenge.initialQuestion': initialQuestion,
        'practicalChallenge.status': 'pending'
      });

      return initialQuestion;
    } catch (error) {
      console.error('Error starting practical challenge:', error);
      // Don't throw error up, as this is a non-critical background task
    }
  }

  async respondToChallenge(syllabusId, instructorResponse) {
    try {
      const syllabus = await Syllabus.findById(syllabusId);
      if (!syllabus) throw new Error('Syllabus not found');

      const discussion = Array.isArray(syllabus.practicalChallenge?.discussion)
        ? syllabus.practicalChallenge.discussion
        : [];

      const discussionHistory = discussion.map(d => 
        `Instructor: ${d.instructorResponse}\nAI: ${d.aiResponse}`
      ).join('\n\n');

      const prompt = `
        You are an expert academic advisor for an MBA program. An instructor is responding to your challenge question.
        Your goal is to provide constructive, actionable suggestions based on their response.

        Context:
        - Student Profile: The class is composed of students from IT, Finance, Military, and Management backgrounds.
        - Initial Question: ${syllabus.practicalChallenge.initialQuestion}
        - Discussion History:
        ${discussionHistory}
        - Instructor's Latest Response: "${instructorResponse}"

        Task:
        Generate a helpful response in Ukrainian that includes:
        1. Acknowledgment of the instructor's idea.
        2. 2-3 concrete suggestions for practical exercises, case studies (especially with Ukrainian examples), or interactive methods.
        3. A follow-up question to encourage deeper thinking.

        Keep the response concise and professional.
      `;

      const response = await this.openai.responses.create({
        model: this.llmModel,
        input: [
          { role: 'system', content: 'You are an expert academic advisor for an MBA program. Your task is to provide helpful, actionable feedback to instructors.' },
          { role: 'user', content: prompt }
        ]
      });

      const aiResponse = (response.output_text || this.extractResponsesText(response) || '').trim();

      // Add to discussion history
      if (!Array.isArray(syllabus.practicalChallenge.discussion)) {
        syllabus.practicalChallenge.discussion = [];
      }
      syllabus.practicalChallenge.discussion.push({
        instructorResponse,
        aiResponse,
        respondedAt: new Date()
      });
      await syllabus.save();

      // OPTIONAL: generate 1-2 concise improvement recommendations derived from AI response
      try {
        const recPrompt = `Виділи з наступної відповіді AI до викладача 1-2 найкорисніші конкретні покращення силабусу у форматі JSON:
{"recommendations":[{"category":"content|structure|objectives|assessment|cases|methods","title":"Коротка назва","description":"Лаконічний опис <=160 символів"}]}
Текст відповіді:
${aiResponse}
Поверни тільки JSON.`;
        const recResp = await this.openai.responses.create({
          model: this.llmModel,
          input: [
            { role: 'system', content: 'Ти асистент. Екстрагуєш короткі actionable рекомендації.' },
            { role: 'user', content: recPrompt }
          ],
          text: { format: 'json' }
        });
        const rawRec = (recResp.output_text || this.extractResponsesText(recResp) || '').trim();
        const parsed = this.safeParseJSON(rawRec) || {};
        const newRecs = (parsed.recommendations || []).slice(0,2).map(r => ({
          id: 'chlg_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
          category: ['structure','content','objectives','assessment','cases','methods'].includes(r.category) ? r.category : 'methods',
          title: r.title?.slice(0,120) || 'Рекомендація',
          description: r.description?.slice(0,300) || '',
          priority: 'medium',
          status: 'pending'
        }));
        if (newRecs.length) {
          syllabus.recommendations.push(...newRecs);
          await syllabus.save();
        }
      } catch(ex){
        console.warn('Challenge recommendation extraction failed (non-critical):', ex.message);
      }

      return aiResponse;
    } catch (error) {
      console.error('Error responding to challenge:', error);
      throw new Error('Failed to generate AI response for challenge.');
    }
  }

  async generateInteractiveRecommendations(topic, studentClusters = [], difficulty = 'intermediate') {
    try {
      const prompt = `
        Generate a list of 3-5 practical and interactive teaching recommendations for an MBA course on the topic of "${topic}".
        The recommendations should be tailored for the following student clusters: ${studentClusters.join(', ')}.
        The desired difficulty level is ${difficulty}.

        For each recommendation, provide:
        - type: (e.g., 'Case Study', 'Simulation', 'Workshop', 'Guest Speaker', 'Project')
        - title: A catchy title.
        - description: A brief description of the activity.
        - relevance: Explain why it's relevant for the specified student clusters.
        - potential_sources: Suggest potential Ukrainian companies or public data sources where applicable.

        Provide the output as a JSON object containing a single key "recommendations" which is an array of objects. For example: {"recommendations": [...]}.
      `;

  const response = await this.openai.responses.create({
        model: this.llmModel,
        input: [
          { role: 'system', content: 'You are an expert in curriculum design for MBA programs. Generate practical, interactive teaching ideas in JSON format.' },
          { role: 'user', content: prompt }
        ],
        text: { format: 'json' }
  });

      const raw = (response.output_text || this.extractResponsesText(response) || '').trim();
      const recommendations = this.safeParseJSON(raw) || {};
      return recommendations.recommendations || recommendations; // Handle potential nesting
    } catch (error) {
      console.error('Error generating interactive recommendations:', error);
      throw new Error('Failed to generate interactive recommendations.');
    }
  }

  async generateResponseToComment(syllabusId, recommendationId, comment) {
    try {
      const response = await this.openai.responses.create({
        model: this.llmModel,
        input: [
          { role: 'system', content: 'Ти асистент викладача MBA програми. Відповідай на коментарі конструктивно та професійно українською мовою.' },
          { role: 'user', content: `Викладач залишив такий коментар до рекомендації: "${comment}". Надай професійну відповідь, яка покаже розуміння його точки зору та запропонує альтернативи якщо потрібно.` }
        ]
      });

      return (response.output_text || this.extractResponsesText(response) || '').trim();
    } catch (error) {
      console.error('Error generating AI response:', error);
      return "Дякую за ваш відгук. Я врахую ваші коментарі для покращення майбутніх рекомендацій.";
    }
  }

  // Integration with Google Forms (webhook handling)
  async processSurveyResponse(formData) {
    try {
      // Normalize and persist Google Forms payload as Survey + SurveyResponse
      const surveyTitle = 'Student Profiling Survey for MBA Program';
      // Ensure the Survey exists (lazy-create)
      let survey = await Survey.findOne({ title: surveyTitle });
      if (!survey) {
        const User = require('../models/User');
        const adminUser = await User.findOne({ role: 'admin' });
        const questions = [
          {
            text: "Describe ONE of the biggest challenges you're facing at work right now that you believe could be solved through MBA knowledge. Be as specific as possible.",
            type: 'open_text',
            required: true,
            order: 1
          },
          {
            text: 'What are 2–3 types of decisions you make most frequently in your work? What makes these decisions particularly challenging?',
            type: 'open_text',
            required: true,
            order: 2
          },
          {
            text: "Think of a situation from the past month when you thought: 'I should have known something from management/economics/strategy to handle this better.' What was that situation?",
            type: 'open_text',
            required: true,
            order: 3
          },
          {
            text: 'In which area or function do you have experience that you could share with colleagues? And conversely - what industry/function experience would be most interesting for you to learn from?',
            type: 'open_text',
            required: true,
            order: 4
          },
          {
            text: 'How do you typically learn most effectively - through case studies, discussions, hands-on practice, or something else? And what prevents you from applying new knowledge at work?',
            type: 'open_text',
            required: true,
            order: 5
          }
        ];

        survey = new Survey({
          title: surveyTitle,
          description: 'Imported from Google Forms',
          questions,
          createdBy: adminUser?._id,
          isActive: true,
          targetAudience: 'students'
        });
        await survey.save();
      }

      // Helper to coalesce values from multiple possible keys
      const getVal = (...keys) => keys.map(k => formData[k]).find(v => v !== undefined && v !== null && String(v).trim() !== '');

      // Coerce responses from either canonical keys or question titles
      const payload = {
        firstName: getVal('firstName', 'First Name') || '',
        lastName: getVal('lastName', 'Last Name') || '',
        challenge: getVal(
          'challenge',
          "Describe ONE of the biggest challenges you're facing at work right now that you believe could be solved through MBA knowledge. Be as specific as possible."
        ) || '',
        decisions: getVal(
          'decisions',
          'What are 2–3 types of decisions you make most frequently in your work? What makes these decisions particularly challenging?'
        ) || '',
        situation: getVal(
          'situation',
          "Think of a situation from the past month when you thought: 'I should have known something from management/economics/strategy to handle this better.' What was that situation?"
        ) || '',
        experience: getVal(
          'experience',
          'In which area or function do you have experience that you could share with colleagues? And conversely - what industry/function experience would be most interesting for you to learn from?'
        ) || '',
        learningStyle: getVal(
          'learningStyle',
          'How do you typically learn most effectively - through case studies, discussions, hands-on practice, or something else? And what prevents you from applying new knowledge at work?'
        ) || ''
      };

      // Map to SurveyResponse answers
      const qMap = new Map(survey.questions.map(q => [q.text, q._id]));
      const answers = [];
      const pushAnswer = (qText, value) => {
        const qId = qMap.get(qText);
        if (qId && value && String(value).trim() !== '') {
          answers.push({ questionId: qId, answer: String(value), textAnswer: String(value) });
        }
      };
      pushAnswer(survey.questions.find(q => q.order === 1).text, payload.challenge);
      pushAnswer(survey.questions.find(q => q.order === 2).text, payload.decisions);
      pushAnswer(survey.questions.find(q => q.order === 3).text, payload.situation);
      pushAnswer(survey.questions.find(q => q.order === 4).text, payload.experience);
      pushAnswer(survey.questions.find(q => q.order === 5).text, payload.learningStyle);

      const response = new SurveyResponse({
        survey: survey._id,
        answers,
        isAnonymous: true,
        respondent: {}
      });
      await response.save();

      const processedData = { ...payload, surveyId: String(survey._id), responseId: String(response._id) };
      console.log('Survey response processed and stored:', processedData);
      return processedData;
    } catch (error) {
      console.error('Error processing survey response:', error);
      throw error;
    }
  }

  // Normalize OpenAI analysis JSON to fit Syllabus model schema
  normalizeAnalysisForModel(analysis) {
    const normalized = { ...analysis };

    // Normalize learning objectives
    if (normalized.learningObjectivesAlignment) {
      const loa = normalized.learningObjectivesAlignment;
      normalized.learningObjectivesAlignment = {
        score: typeof loa.score === 'number' ? loa.score : (loa.overallScore || 0),
        alignedObjectives: loa.alignedObjectives || loa.coveredObjectives || [],
        missingObjectives: loa.missingObjectives || [],
        recommendations: loa.recommendations || []
      };
    } else {
      normalized.learningObjectivesAlignment = { score: 0, alignedObjectives: [], missingObjectives: [], recommendations: [] };
    }

    // Normalize template compliance
    if (normalized.templateCompliance) {
      const tc = normalized.templateCompliance;
      normalized.templateCompliance = {
        score: tc.score || 0,
        missingElements: tc.missingElements || [],
        recommendations: tc.recommendations || []
      };
    } else {
      normalized.templateCompliance = { score: 0, missingElements: [], recommendations: [] };
    }

    // Normalize student cluster analysis
    const sca = normalized.studentClusterAnalysis || {};
    // Map clusterRelevance {cluster: score} to dominantClusters with percentages
    const rel = sca.clusterRelevance || {};
    const relEntries = Object.entries(rel);
    let dominantClusters = [];
    if (relEntries.length > 0) {
      const total = relEntries.reduce((sum, [, v]) => sum + (typeof v === 'number' ? v : 0), 0) || 1;
      dominantClusters = relEntries.map(([cluster, value]) => ({
        cluster,
        percentage: Math.round((value / total) * 100),
        recommendations: []
      }));
    }

    // Normalize suggested cases (merge any incoming formats)
    const mapCase = (c) => ({
      company: c.company || c.title || c.caseTitle || 'Case',
      cluster: c.cluster || (Array.isArray(c.clusters) ? c.clusters.join(', ') : ''),
      description: c.description || c.summary || '',
      relevance: typeof c.relevance === 'number' ? c.relevance : (c.relevanceScore || 0)
    });

    const suggestedCases = [
      ...((sca.suggestedCases || []).map(mapCase))
    ];

    normalized.studentClusterAnalysis = {
      dominantClusters,
      suggestedCases,
      // preserve AI-provided adaptation recommendations if present
      adaptationRecommendations: Array.isArray(sca.adaptationRecommendations) ? sca.adaptationRecommendations : []
    };

    // Ensure structure exists
    normalized.structure = normalized.structure || {
      hasObjectives: false,
      hasAssessment: false,
      hasSchedule: false,
      hasResources: false,
      completenessScore: 0,
      missingParts: []
    };

    // Normalize recommendations
    normalized.recommendations = this.formatRecommendations(normalized.recommendations || []);

    return normalized;
  }
}

module.exports = new AIService();
