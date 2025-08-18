const express = require('express');
const { auth } = require('../middleware/auth');
const { manager } = require('../middleware/roles');
const Syllabus = require('../models/Syllabus');
const User = require('../models/User');
const PracticalIdea = require('../models/PracticalIdea');

const router = express.Router();

// Lazy-loaded heavy libs to avoid startup penalty
let ExcelJS = null;
let PDFDocument = null;

// Generate individual syllabus report
router.get('/syllabus/:id', auth, async (req, res) => {
  try {
    const syllabusId = req.params.id;
    
    const syllabus = await Syllabus.findById(syllabusId)
      .populate('instructor', 'firstName lastName email department');

    if (!syllabus) {
      return res.status(404).json({
        message: 'Syllabus not found'
      });
    }

    // Check ownership or admin/manager access
    if (syllabus.instructor && 
        syllabus.instructor._id.toString() !== req.user.userId && 
        !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    // Get practical ideas for this syllabus
    const practicalIdeas = await PracticalIdea.find({ syllabus: syllabusId })
      .sort({ createdAt: -1 });

    // Calculate quality score
    const qualityScore = syllabus.calculateQualityScore();

    // Generate report data
  const recommendationTimeline = buildRecommendationTimeline(syllabus);
  const report = {
      syllabus: {
        id: syllabus._id,
        title: syllabus.title,
        course: syllabus.course,
        instructor: syllabus.instructor ? {
          name: `${syllabus.instructor.firstName || ''} ${syllabus.instructor.lastName || ''}`,
          email: syllabus.instructor.email || '',
          department: syllabus.instructor.department || ''
        } : {
          name: 'Unknown Instructor',
          email: '',
          department: ''
        },
        uploadedAt: syllabus.createdAt,
        status: syllabus.status,
        qualityScore
      },
      aiChallenger: {
        initialQuestion: syllabus.practicalChallenge?.initialQuestion || '',
        status: syllabus.practicalChallenge?.status || 'pending',
        discussion: Array.isArray(syllabus.practicalChallenge?.discussion) ? syllabus.practicalChallenge.discussion : []
      },
      analysis: {
        templateCompliance: syllabus.analysis?.templateCompliance || {},
        learningObjectivesAlignment: syllabus.analysis?.learningObjectivesAlignment || {},
  studentClusterAnalysis: syllabus.analysis?.studentClusterAnalysis || {},
  surveyInsights: syllabus.analysis?.surveyInsights || {},
        plagiarismCheck: syllabus.analysis?.plagiarismCheck || {}
      },
      recommendations: {
        total: syllabus.recommendations.length,
        accepted: syllabus.recommendations.filter(r => r.status === 'accepted').length,
        rejected: syllabus.recommendations.filter(r => r.status === 'rejected').length,
        pending: syllabus.recommendations.filter(r => r.status === 'pending').length,
        commented: syllabus.recommendations.filter(r => r.status === 'commented').length,
    details: syllabus.recommendations,
    acceptanceRate: syllabus.recommendations.length > 0 ? Math.round((syllabus.recommendations.filter(r => r.status === 'accepted').length / syllabus.recommendations.length) * 100) : 0,
    timeline: recommendationTimeline
      },
  groupedRecommendations: buildGroupedRecommendations(syllabus),
      practicalIdeas: {
        total: practicalIdeas.length,
        byType: getIdeaCountsByType(practicalIdeas),
        implemented: practicalIdeas.filter(idea => idea.isImplemented).length,
        details: practicalIdeas
      },
      summary: generateSyllabusSummary(syllabus, practicalIdeas, qualityScore)
    };

    res.json({
      message: 'Syllabus report generated successfully',
      report
    });

  } catch (error) {
    console.error('Syllabus report generation error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Generate aggregate analytics for management
router.get('/analytics', auth, manager, async (req, res) => {
  try {
    const timeRange = req.query.timeRange || '6months'; // 1month, 3months, 6months, 1year
    const department = req.query.department;

    const dateFilter = getDateFilter(timeRange);
    
    const syllabusQuery = { createdAt: { $gte: dateFilter } };
    const userQuery = {};

    if (department) {
      const departmentUsers = await User.find({ department }).select('_id');
      syllabusQuery.instructor = { $in: departmentUsers.map(u => u._id) };
      userQuery.department = department;
    }

    const syllabi = await Syllabus.find(syllabusQuery)
      .populate('instructor', 'firstName lastName department');

    const users = await User.find({ 
      ...userQuery,
      createdAt: { $gte: dateFilter } 
    });

    const analytics = {
      overview: {
        totalSyllabi: syllabi.length,
        totalInstructors: new Set(
          syllabi
            .filter(s => s.instructor && s.instructor._id)
            .map(s => s.instructor._id.toString())
        ).size,
        averageQualityScore: calculateAverageQualityScore(syllabi)
      },
      syllabusAnalytics: {
        byStatus: getSyllabusCountsByStatus(syllabi),
        byDepartment: getSyllabusCountsByDepartment(syllabi),
        qualityDistribution: getQualityScoreDistribution(syllabi),
        commonIssues: getCommonIssues(syllabi),
        improvementTrends: getImprovementTrends(syllabi)
      },
      recommendationAnalytics: {
        totalRecommendations: syllabi.reduce((sum, s) => sum + s.recommendations.length, 0),
        acceptanceRate: calculateRecommendationAcceptanceRate(syllabi),
        byCategory: getRecommendationsByCategory(syllabi),
        responseTime: calculateAverageResponseTime(syllabi)
      },
      userAnalytics: {
        newUsers: users.length,
        activeUsers: await getActiveUsersCount(dateFilter),
        byRole: getUserCountsByRole(users),
        engagement: await getUserEngagementMetrics(dateFilter)
      },
      timeSeriesData: await generateTimeSeriesData(dateFilter, syllabusQuery)
    };

    res.json({
      message: 'Analytics generated successfully',
      analytics,
      filters: {
        timeRange,
        department: department || 'all',
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Analytics generation error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Top instructors (manager/admin)
router.get('/top-instructors', auth, manager, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    // Aggregate syllabus counts per instructor
    const syllabusCounts = await Syllabus.aggregate([
      { $match: { instructor: { $ne: null } } },
      { $group: { _id: '$instructor', syllabusCount: { $sum: 1 } } },
      { $sort: { syllabusCount: -1 } },
      { $limit: limit }
    ]);

    const instructorIds = syllabusCounts.map(s => s._id);
    if (instructorIds.length === 0) {
      return res.json({ instructors: [] });
    }

    const instructors = await User.find({ _id: { $in: instructorIds }, role: 'instructor' })
      .select('firstName lastName email department role createdAt');

    // Map counts to user objects
    const countMap = syllabusCounts.reduce((acc, item) => { acc[item._id.toString()] = item.syllabusCount; return acc; }, {});
    const enriched = instructors.map(u => ({
      _id: u._id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      department: u.department,
      syllabusCount: countMap[u._id.toString()] || 0
    })).sort((a, b) => b.syllabusCount - a.syllabusCount);

    res.json({ instructors: enriched });
  } catch (error) {
    console.error('Top instructors fetch error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Export aggregate syllabi report as CSV/Excel/PDF (manager/admin scope)
router.get('/export/:type', auth, manager, async (req, res) => {
  try {
    const { type } = req.params; // 'pdf' or 'excel'
    const { syllabusIds, department, timeRange = '6months' } = req.query;

    if (!['pdf', 'excel', 'csv'].includes(type)) {
      return res.status(400).json({
        message: 'Invalid export type. Use pdf, excel, or csv'
      });
    }

    const dateFilter = getDateFilter(timeRange);
    let query = { createdAt: { $gte: dateFilter } };

    if (syllabusIds) {
      query._id = { $in: syllabusIds.split(',') };
    }

    if (department) {
      const departmentUsers = await User.find({ department }).select('_id');
      query.instructor = { $in: departmentUsers.map(u => u._id) };
    }

    const syllabi = await Syllabus.find(query)
      .populate('instructor', 'firstName lastName email department')
      .sort({ createdAt: -1 });

    if (type === 'csv') {
      const csv = generateCSVExport(syllabi);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="syllabi-report-${Date.now()}.csv"`);
      return res.send(csv);
    }

    if (type === 'excel') {
      if (!ExcelJS) ExcelJS = require('exceljs');
      const buffer = await generateExcelExportBuffer(syllabi);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="syllabi-report-${Date.now()}.xlsx"`);
      return res.send(buffer);
    }

    if (type === 'pdf') {
      if (!PDFDocument) PDFDocument = require('pdfkit');
      const buffer = await generatePDFExportBuffer(syllabi);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="syllabi-report-${Date.now()}.pdf"`);
      return res.send(buffer);
    }

    return res.status(400).json({ message: 'Unsupported export type' });

  } catch (error) {
    console.error('Export generation error:', error);
    res.status(500).json({
      message: 'Internal server error during export'
    });
  }
});

// Export single syllabus detailed report including timeline & analysis
router.get('/syllabus/:id/export/:type', auth, async (req, res) => {
  try {
    const { id, type } = req.params;
    const syllabus = await Syllabus.findById(id)
      .populate('instructor', 'firstName lastName email department');
    if (!syllabus) return res.status(404).json({ message: 'Syllabus not found' });

    // Permission: owner or manager/admin
    if (syllabus.instructor && syllabus.instructor._id.toString() !== req.user.userId && !['admin','manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const practicalIdeas = await PracticalIdea.find({ syllabus: id }).sort({ createdAt: -1 });
    const qualityScore = syllabus.calculateQualityScore();
    const timeline = buildRecommendationTimeline(syllabus);
    const baseReport = {
      title: syllabus.title,
      course: syllabus.course,
      instructor: syllabus.instructor ? `${syllabus.instructor.firstName || ''} ${syllabus.instructor.lastName || ''}` : 'Unknown',
      department: syllabus.instructor?.department || '',
      uploadedAt: syllabus.createdAt,
      status: syllabus.status,
      qualityScore,
      analysis: syllabus.analysis,
      recommendations: syllabus.recommendations,
      recommendationTimeline: timeline,
      practicalIdeas,
      generatedAt: new Date()
    };

    if (type === 'csv') {
  const rows = ['Field,Value', ...Object.entries({
        Title: baseReport.title,
        Department: baseReport.department,
        Instructor: baseReport.instructor,
        Status: baseReport.status,
        QualityScore: baseReport.qualityScore,
        TotalRecommendations: syllabus.recommendations.length,
        Accepted: syllabus.recommendations.filter(r=>r.status==='accepted').length,
        Rejected: syllabus.recommendations.filter(r=>r.status==='rejected').length,
        Commented: syllabus.recommendations.filter(r=>r.status==='commented').length
  }).map(([k,v]) => `${k},"${v}"`),
  'AIChallenger:', 'InitialQuestion,Status',
  `${JSON.stringify(syllabus.practicalChallenge?.initialQuestion || '').replace(/"/g,'"')},${syllabus.practicalChallenge?.status || 'pending'}`,
  'Discussion:', 'When,InstructorResponse,AIResponse',
  ...((Array.isArray(syllabus.practicalChallenge?.discussion) ? syllabus.practicalChallenge.discussion : []).map(d => `${new Date(d.respondedAt||syllabus.createdAt).toISOString()},"${(d.instructorResponse||'').replace(/"/g,'"')}","${(d.aiResponse||'').replace(/"/g,'"')}"`)),
  'Timeline:', 'RecommendationID,OldStatus,NewStatus,Comment,At'];
      timeline.forEach(ev => rows.push(`${ev.recommendationId || ''},${ev.from || ''},${ev.to},"${(ev.comment||'').replace(/"/g,'"')}" ,${new Date(ev.at).toISOString()}`));
      const grouped = buildGroupedRecommendations(syllabus);
      rows.push('Grouped Recommendations:,');
      rows.push('From Survey,'); grouped.surveyBased.forEach(t => rows.push(`,"${t.replace(/"/g,'"')}"`));
      rows.push('Clusters & Ukrainian Cases,'); grouped.clusterAndUkrainianCases.forEach(t => rows.push(`,"${t.replace(/"/g,'"')}"`));
      rows.push('Plagiarism,'); grouped.plagiarism.forEach(t => rows.push(`,"${t.replace(/"/g,'"')}"`));
      rows.push('Learning Objectives,'); grouped.learningObjectives.forEach(t => rows.push(`,"${t.replace(/"/g,'"')}"`));
      rows.push('Template Compliance,'); grouped.templateCompliance.forEach(t => rows.push(`,"${t.replace(/"/g,'"')}"`));
      rows.push('AI Challenger,'); grouped.aiChallenger.forEach(t => rows.push(`,"${t.replace(/"/g,'"')}"`));
      const csv = rows.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="syllabus-${id}-report.csv"`);
      return res.send(csv);
    }

  if (type === 'excel') {
      if (!ExcelJS) ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      const meta = wb.addWorksheet('Summary');
      meta.addRow(['Title', baseReport.title]);
      meta.addRow(['Instructor', baseReport.instructor]);
      meta.addRow(['Department', baseReport.department]);
      meta.addRow(['Status', baseReport.status]);
      meta.addRow(['Quality Score', baseReport.qualityScore]);
      meta.addRow(['Generated At', baseReport.generatedAt.toISOString()]);
      const aiSheet = wb.addWorksheet('AI Challenger');
      aiSheet.addRow(['Initial Question', syllabus.practicalChallenge?.initialQuestion || '']);
      aiSheet.addRow(['Status', syllabus.practicalChallenge?.status || 'pending']);
      aiSheet.addRow([]);
      aiSheet.addRow(['When','Instructor Response','AI Response']);
      (Array.isArray(syllabus.practicalChallenge?.discussion) ? syllabus.practicalChallenge.discussion : []).forEach(d => {
        aiSheet.addRow([d.respondedAt || '', d.instructorResponse || '', d.aiResponse || '']);
      });
      const recSheet = wb.addWorksheet('Recommendations');
      recSheet.addRow(['ID','Category','Title','Status','Priority','Created','Responded','Comment']);
      syllabus.recommendations.forEach(r=>{
        recSheet.addRow([r.id || r._id, r.category, r.title, r.status, r.priority, r.createdAt, r.respondedAt || '', r.instructorComment || '']);
      });
      const tl = wb.addWorksheet('Timeline');
      tl.addRow(['RecommendationID','From','To','Comment','At']);
      timeline.forEach(ev=> tl.addRow([ev.recommendationId || '', ev.from || '', ev.to, ev.comment || '', ev.at]));
  const grp = buildGroupedRecommendations(syllabus);
  const groupedSheet = wb.addWorksheet('Grouped Recs');
  groupedSheet.addRow(['Category','Recommendation']);
  const pushGroup = (cat, arr) => (arr||[]).forEach(t => groupedSheet.addRow([cat, t]));
  pushGroup('From Survey', grp.surveyBased);
  pushGroup('Clusters & UA Cases', grp.clusterAndUkrainianCases);
  pushGroup('Plagiarism', grp.plagiarism);
  pushGroup('Learning Objectives', grp.learningObjectives);
  pushGroup('Template', grp.templateCompliance);
  pushGroup('AI Challenger', grp.aiChallenger);
      const buffer = await wb.xlsx.writeBuffer();
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition',`attachment; filename="syllabus-${id}-report.xlsx"`);
      return res.send(buffer);
    }

    if (type === 'pdf') {
      if (!PDFDocument) PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 48, size: 'A4' });
      const chunks = [];
      doc.on('data', d => chunks.push(d));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        res.setHeader('Content-Type','application/pdf');
        res.setHeader('Content-Disposition',`attachment; filename="syllabus-${id}-report.pdf"`);
        res.send(pdfBuffer);
      });

      // Header
      const h1 = (text) => { doc.moveDown(0.8); doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text(text); doc.moveDown(0.3); doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#cbd5e1').lineWidth(1).stroke(); doc.moveDown(0.5); };
      const h2 = (text) => { doc.moveDown(0.6); doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text(text); doc.moveDown(0.2); };
      const p = (text) => { doc.font('Helvetica').fontSize(11).fillColor('#111827').text(text, { align: 'left' }); };
      const li = (text) => { doc.font('Helvetica').fontSize(11).text(`• ${text}`); };

      h1('AI Syllabus Analyzer — Detailed Report');
      p(`Title: ${baseReport.title}`);
      p(`Instructor: ${baseReport.instructor} | Department: ${baseReport.department}`);
      p(`Status: ${baseReport.status} | Quality Score: ${baseReport.qualityScore}`);
      p(`Generated: ${new Date(baseReport.generatedAt).toLocaleString()}`);

      // Section 1: Загальне самарі змін
      h2('Загальне самарі змін');
      const acceptedCount = syllabus.recommendations.filter(r=>r.status==='accepted').length;
      const rejectedCount = syllabus.recommendations.filter(r=>r.status==='rejected').length;
      const commentedCount = syllabus.recommendations.filter(r=>r.status==='commented').length;
      const pendingCount = syllabus.recommendations.filter(r=>r.status==='pending').length;
      li(`Прийнято: ${acceptedCount}`);
      li(`Відхилено: ${rejectedCount}`);
      li(`З коментарями: ${commentedCount}`);
      li(`На розгляді: ${pendingCount}`);

      // Section 2: Аналіз відповідності outcomes (ILO)
      h2('Аналіз відповідності курсу outcomes програми MBA');
      const loa = baseReport.analysis?.learningObjectivesAlignment || {};
      p(`Загальний бал відповідності ILO: ${loa.score || loa.overallScore || 0}/100`);
      if (Array.isArray(loa.alignedObjectives) && loa.alignedObjectives.length) {
        p('Покриті цілі:');
        loa.alignedObjectives.slice(0,8).forEach(o=> li(String(o)));
      }
      if (Array.isArray(loa.missingObjectives) && loa.missingObjectives.length) {
        p('Прогалини:');
        loa.missingObjectives.slice(0,8).forEach(o=> li(String(o)));
      }

      // Section 3: Оцінка практичності та інтерактивності
      h2('Оцінка практичності та інтерактивності курсу');
  const compScore = (syllabus.structure?.completenessScore || 0);
  const practicalityScore = Math.round(((baseReport.analysis?.templateCompliance?.score||0)*0.3 + compScore*0.3 + Math.min(100,(syllabus.practicalChallenge?.aiSuggestions?.length||0)*10)*0.4));
      p(`Інтегральна оцінка практичності: ${Math.max(0, Math.min(100, practicalityScore))}/100`);
      const ideas = Array.isArray(syllabus.practicalChallenge?.aiSuggestions) ? syllabus.practicalChallenge.aiSuggestions : [];
      if (ideas.length) {
        p('Інтерактивні пропозиції:');
        ideas.slice(0,5).forEach(s => li(String(s.suggestion || '').slice(0,180)));
      }

  // Section 4: Пропозиції щодо покращень
      h2('Пропозиції щодо потенційних покращень');
      const improvements = [];
      if ((baseReport.analysis?.templateCompliance?.missingElements||[]).length>0) improvements.push('Додати відсутні елементи згідно шаблону силабусу.');
      if ((loa.missingObjectives||[]).length>0) improvements.push('Закрити прогалини відповідності ILO та синхронізувати оцінювання.');
      if ((baseReport.analysis?.studentClusterAnalysis?.suggestedCases||[]).length<3) improvements.push('Додати українські приклади/кейси для релевантних кластерів студентів.');
      if (ideas.length===0) improvements.push('Запланувати інтерактивні активності: дискусії, групові вправи, peer-to-peer.');
      (improvements.length? improvements : ['Суттєвих прогалин не виявлено.']).forEach(t=> li(t));

      // Grouped recommendation sections per user spec
      const grouped = buildGroupedRecommendations(syllabus);
      h2('Рекомендації за результатами опитування');
      (grouped.surveyBased.length ? grouped.surveyBased : ['Немає даних опитування']).forEach(t => li(t));

      h2('Рекомендації щодо інтеграції українських кейсів та практичних завдань');
      (grouped.clusterAndUkrainianCases.length ? grouped.clusterAndUkrainianCases : ['Немає рекомендацій по кластерам/кейсам']).forEach(t => li(t));

      if ((syllabus.analysis?.plagiarismCheck?.similarSyllabi || []).length) {
        h2('Попередження щодо плагіату та відрекомендовані зміни');
        (grouped.plagiarism.length ? grouped.plagiarism : ['Суттєвої схожості не виявлено']).forEach(t => li(t));
      }

      h2('Рекомендації за відповідністю до Learning Objectives');
      (grouped.learningObjectives.length ? grouped.learningObjectives : ['Немає додаткових рекомендацій по ILO']).forEach(t => li(t));

      h2('Рекомендації за відповідністю до шаблону');
      (grouped.templateCompliance.length ? grouped.templateCompliance : ['Шаблон здебільшого виконано']).forEach(t => li(t));

      h2('Рекомендації за відповідями на AI-челенджер');
      (grouped.aiChallenger.length ? grouped.aiChallenger : ['Немає збережених порад від AI-челенджера']).forEach(t => li(t));

      // Appendix: AI Challenger timeline and recommendations list
      h2('AI Challenger — Підсумок');
      p(`Початкове питання: ${syllabus.practicalChallenge?.initialQuestion || ''}`);
      p(`Статус: ${syllabus.practicalChallenge?.status || 'pending'}`);
      const disc = Array.isArray(syllabus.practicalChallenge?.discussion) ? syllabus.practicalChallenge.discussion : [];
      if (disc.length) {
        p('Дискусія:');
        disc.forEach(d => {
          li(`${new Date(d.respondedAt||syllabus.createdAt).toLocaleString()} — Інструктор: ${(d.instructorResponse||'').slice(0,120)}`);
          if (d.aiResponse) li(`AI: ${String(d.aiResponse).slice(0,160)}`);
        });
      }

      h2('Перелік рекомендацій');
      syllabus.recommendations.forEach(r => {
        li(`[${(r.status||'pending').toUpperCase()}] (${r.category}) ${r.title} — ${r.priority}`);
        if (r.instructorComment) p(`   Коментар: ${r.instructorComment}`);
      });

      // End
      doc.end();
      return;
    }

    return res.status(400).json({ message: 'Unsupported export type' });
  } catch (error) {
    console.error('Single syllabus export error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Helper functions
function getDateFilter(timeRange) {
  const now = new Date();
  switch (timeRange) {
    case '1month':
      return new Date(now.setMonth(now.getMonth() - 1));
    case '3months':
      return new Date(now.setMonth(now.getMonth() - 3));
    case '6months':
      return new Date(now.setMonth(now.getMonth() - 6));
    case '1year':
      return new Date(now.setFullYear(now.getFullYear() - 1));
    default:
      return new Date(now.setMonth(now.getMonth() - 6));
  }
}

function getIdeaCountsByType(ideas) {
  const counts = {};
  ideas.forEach(idea => {
    counts[idea.type] = (counts[idea.type] || 0) + 1;
  });
  return counts;
}

function generateSyllabusSummary(syllabus, practicalIdeas, qualityScore) {
  const recommendations = syllabus.recommendations;
  const acceptedCount = recommendations.filter(r => r.status === 'accepted').length;
  const totalRecommendations = recommendations.length;

  return {
    overallAssessment: getOverallAssessment(qualityScore),
    keyStrengths: getKeyStrengths(syllabus),
    areasForImprovement: getAreasForImprovement(syllabus),
    implementationProgress: totalRecommendations > 0 ? 
      Math.round((acceptedCount / totalRecommendations) * 100) : 0,
    practicalIdeasGenerated: practicalIdeas.length,
    nextSteps: generateNextSteps(syllabus, practicalIdeas)
  };
}

function getOverallAssessment(qualityScore) {
  if (qualityScore >= 90) return 'Excellent - Exceeds standards';
  if (qualityScore >= 80) return 'Good - Meets standards with minor improvements needed';
  if (qualityScore >= 70) return 'Satisfactory - Meets basic standards';
  if (qualityScore >= 60) return 'Needs Improvement - Several areas require attention';
  return 'Poor - Significant improvements required';
}

function getKeyStrengths(syllabus) {
  const strengths = [];
  
  if (syllabus.analysis?.templateCompliance?.score >= 80) {
    strengths.push('Well-structured with all required sections');
  }
  if (syllabus.analysis?.learningObjectivesAlignment?.score >= 80) {
    strengths.push('Strong alignment with MBA learning objectives');
  }
  if (syllabus.analysis?.plagiarismCheck?.uniquenessScore >= 80) {
    strengths.push('Highly unique content');
  }
  if (syllabus.recommendations.filter(r => r.status === 'accepted').length > syllabus.recommendations.length * 0.7) {
    strengths.push('High engagement with improvement recommendations');
  }

  return strengths.length > 0 ? strengths : ['Course foundation is in place'];
}

function getAreasForImprovement(syllabus) {
  const improvements = [];
  
  if (syllabus.analysis?.templateCompliance?.score < 70) {
    improvements.push('Course structure and required sections');
  }
  if (syllabus.analysis?.learningObjectivesAlignment?.score < 70) {
    improvements.push('Alignment with MBA learning objectives');
  }
  if (syllabus.analysis?.plagiarismCheck?.uniquenessScore < 70) {
    improvements.push('Content uniqueness and originality');
  }
  if (syllabus.recommendations.filter(r => r.status === 'pending').length > 3) {
    improvements.push('Response to improvement recommendations');
  }

  return improvements;
}

function generateNextSteps(syllabus, practicalIdeas) {
  const steps = [];
  
  const pendingRecommendations = syllabus.recommendations.filter(r => r.status === 'pending');
  if (pendingRecommendations.length > 0) {
    steps.push(`Review and respond to ${pendingRecommendations.length} pending recommendations`);
  }

  const unimplementedIdeas = practicalIdeas.filter(idea => !idea.isImplemented);
  if (unimplementedIdeas.length > 0) {
    steps.push(`Implement ${unimplementedIdeas.length} practical ideas generated during AI sessions`);
  }

  if (syllabus.analysis?.studentClusterAnalysis?.suggestedCases?.length > 0) {
    steps.push('Incorporate suggested Ukrainian business cases relevant to student backgrounds');
  }

  if (steps.length === 0) {
    steps.push('Continue monitoring student feedback and course effectiveness');
  }

  return steps;
}

function calculateAverageQualityScore(syllabi) {
  if (syllabi.length === 0) return 0;
  
  const scores = syllabi.map(s => s.calculateQualityScore());
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function getSyllabusCountsByStatus(syllabi) {
  const counts = { processing: 0, analyzed: 0, reviewed: 0, approved: 0 };
  syllabi.forEach(s => {
    counts[s.status] = (counts[s.status] || 0) + 1;
  });
  return counts;
}

function getSyllabusCountsByDepartment(syllabi) {
  const counts = {};
  syllabi.forEach(s => {
    const dept = (s.instructor && s.instructor.department) || 'Unknown';
    counts[dept] = (counts[dept] || 0) + 1;
  });
  return counts;
}

function getQualityScoreDistribution(syllabi) {
  const distribution = { 
    excellent: 0, // 90-100
    good: 0,      // 80-89
    satisfactory: 0, // 70-79
    needsImprovement: 0, // 60-69
    poor: 0       // <60
  };

  syllabi.forEach(s => {
    const score = s.calculateQualityScore();
    if (score >= 90) distribution.excellent++;
    else if (score >= 80) distribution.good++;
    else if (score >= 70) distribution.satisfactory++;
    else if (score >= 60) distribution.needsImprovement++;
    else distribution.poor++;
  });

  return distribution;
}

function getCommonIssues(syllabi) {
  const issueFrequency = {};
  
  syllabi.forEach(s => {
    if (s.analysis?.templateCompliance?.missingElements) {
      s.analysis.templateCompliance.missingElements.forEach(issue => {
        issueFrequency[issue] = (issueFrequency[issue] || 0) + 1;
      });
    }
  });

  return Object.entries(issueFrequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([issue, count]) => ({ issue, count }));
}

function getImprovementTrends(syllabi) {
  const versioned = syllabi.filter(s => s.version > 1);
  return {
    syllabusRevisionsCount: versioned.length,
    averageRevisions: versioned.length > 0 ? 
      versioned.reduce((sum, s) => sum + s.version, 0) / versioned.length : 0
  };
}

function calculateRecommendationAcceptanceRate(syllabi) {
  let totalRecommendations = 0;
  let acceptedRecommendations = 0;

  syllabi.forEach(s => {
    totalRecommendations += s.recommendations.length;
    acceptedRecommendations += s.recommendations.filter(r => r.status === 'accepted').length;
  });

  return totalRecommendations > 0 ? 
    Math.round((acceptedRecommendations / totalRecommendations) * 100) : 0;
}

function getRecommendationsByCategory(syllabi) {
  const categories = {};
  
  syllabi.forEach(s => {
    s.recommendations.forEach(r => {
      if (!categories[r.category]) {
        categories[r.category] = { total: 0, accepted: 0, rejected: 0, pending: 0 };
      }
      categories[r.category].total++;
      categories[r.category][r.status]++;
    });
  });

  return categories;
}

function calculateAverageResponseTime(syllabi) {
  const responses = [];
  
  syllabi.forEach(s => {
    s.recommendations.forEach(r => {
      if (r.respondedAt && r.createdAt) {
        const responseTime = (new Date(r.respondedAt) - new Date(r.createdAt)) / (1000 * 60 * 60 * 24); // days
        responses.push(responseTime);
      }
    });
  });

  return responses.length > 0 ? 
    Math.round(responses.reduce((sum, time) => sum + time, 0) / responses.length * 10) / 10 : 0;
}

async function getActiveUsersCount(dateFilter) {
  const activeSyllabusUploaders = await Syllabus.distinct('instructor', { 
    createdAt: { $gte: dateFilter } 
  });
  
  return activeSyllabusUploaders.length;
}

function getUserCountsByRole(users) {
  const counts = { instructor: 0, admin: 0, manager: 0 };
  users.forEach(u => {
    counts[u.role] = (counts[u.role] || 0) + 1;
  });
  return counts;
}

async function getUserEngagementMetrics(dateFilter) {
  const syllabusUploads = await Syllabus.countDocuments({ 
    createdAt: { $gte: dateFilter } 
  });
  
  return {
    syllabusUploads,
    totalInteractions: syllabusUploads
  };
}

async function generateTimeSeriesData(dateFilter, syllabusQuery) {
  const months = [];
  const currentDate = new Date();
  const startDate = new Date(dateFilter);

  while (startDate <= currentDate) {
    const monthStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const monthEnd = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);

    const monthData = await Syllabus.aggregate([
      {
        $match: {
          ...syllabusQuery,
          createdAt: { $gte: monthStart, $lte: monthEnd }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          avgQuality: { $avg: '$analysis.templateCompliance.score' }
        }
      }
    ]);

    months.push({
      month: monthStart.toISOString().substring(0, 7), // YYYY-MM format
      syllabusCount: monthData.length > 0 ? monthData[0].count : 0,
      averageQuality: monthData.length > 0 ? Math.round(monthData[0].avgQuality || 0) : 0
    });

    startDate.setMonth(startDate.getMonth() + 1);
  }

  return months;
}

function generateCSVExport(syllabi) {
  const headers = [
    'Title', 'Instructor', 'Department', 'Course Code', 'Upload Date', 'Status', 
    'Quality Score', 'Template Score', 'Objectives Score', 'Uniqueness Score',
    'Total Recommendations', 'Accepted Recommendations', 'Rejected Recommendations'
  ];

  const rows = syllabi.map(s => [
    s.title,
    s.instructor ? `${s.instructor.firstName || ''} ${s.instructor.lastName || ''}` : 'Unknown',
    (s.instructor && s.instructor.department) || '',
    s.course.code || '',
    s.createdAt.toISOString().split('T')[0],
    s.status,
    s.calculateQualityScore(),
    s.analysis?.templateCompliance?.score || 0,
    s.analysis?.learningObjectivesAlignment?.score || 0,
    s.analysis?.plagiarismCheck?.uniquenessScore || 0,
    s.recommendations.length,
    s.recommendations.filter(r => r.status === 'accepted').length,
    s.recommendations.filter(r => r.status === 'rejected').length
  ]);

  return [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
}

function generateExcelExport(syllabi) {
  // Legacy fallback (not used after buffer implementation)
  return generateCSVExport(syllabi);
}

function generatePDFExport(syllabi) {
  // Legacy fallback returning HTML (kept for backward compatibility)
  return '<html><body><p>Deprecated PDF export path.</p></body></html>';
}

// New buffer-based Excel export
async function generateExcelExportBuffer(syllabi) {
  if (!ExcelJS) ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Syllabi');
  ws.addRow(['Title','Instructor','Department','Status','Quality Score','Template Score','Objectives Score','Uniqueness','Total Recs','Accepted','Rejected','Pending','Commented']);
  syllabi.forEach(s => {
    const instr = s.instructor ? `${s.instructor.firstName || ''} ${s.instructor.lastName || ''}` : 'Unknown';
    ws.addRow([
      s.title,
      instr,
      (s.instructor && s.instructor.department) || '',
      s.status,
      s.calculateQualityScore(),
      s.analysis?.templateCompliance?.score || 0,
      s.analysis?.learningObjectivesAlignment?.score || 0,
      s.analysis?.plagiarismCheck?.uniquenessScore || 0,
      s.recommendations.length,
      s.recommendations.filter(r=>r.status==='accepted').length,
      s.recommendations.filter(r=>r.status==='rejected').length,
      s.recommendations.filter(r=>r.status==='pending').length,
      s.recommendations.filter(r=>r.status==='commented').length
    ]);
  });
  return wb.xlsx.writeBuffer();
}

// New buffer-based PDF export
async function generatePDFExportBuffer(syllabi) {
  if (!PDFDocument) PDFDocument = require('pdfkit');
  return await new Promise(resolve => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks = [];
    doc.on('data', d => chunks.push(d));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(18).text('AI Syllabus Analyzer Report', { underline: true });
    doc.moveDown();
    syllabi.forEach(s => {
      const instr = s.instructor ? `${s.instructor.firstName || ''} ${s.instructor.lastName || ''}` : 'Unknown';
      doc.fontSize(12).text(`Title: ${s.title}`);
      doc.text(`Instructor: ${instr}`);
      doc.text(`Status: ${s.status}`);
      doc.text(`Quality Score: ${s.calculateQualityScore()}%`);
      doc.text(`Recommendations: ${s.recommendations.length}`);
      doc.moveDown(0.5);
    });
    doc.end();
  });
}

// Build timeline from recommendation status / comment events
function buildRecommendationTimeline(syllabus) {
  const events = [];
  syllabus.recommendations.forEach(r => {
    // Creation event
    events.push({
      recommendationId: r.id || r._id?.toString(),
      to: 'pending',
      at: r.createdAt || syllabus.createdAt,
      type: 'created'
    });
    if (r.status && r.status !== 'pending') {
      events.push({
        recommendationId: r.id || r._id?.toString(),
        from: 'pending',
        to: r.status,
        at: r.respondedAt || r.updatedAt || r.createdAt,
        type: 'status-change',
        comment: r.instructorComment
      });
    }
  });
  return events.sort((a,b) => new Date(a.at) - new Date(b.at));
}

// Group recommendations per user spec for the syllabus report
function buildGroupedRecommendations(syllabus) {
  const grouped = {
    surveyBased: [],
    clusterAndUkrainianCases: [],
    plagiarism: [],
    learningObjectives: [],
    templateCompliance: [],
    aiChallenger: []
  };

  // From analysis.surveyInsights
  const survey = syllabus.analysis?.surveyInsights;
  if (survey) {
    const recs = [];
    if (Array.isArray(survey.commonChallenges) && survey.commonChallenges.length) {
      recs.push(`Адресувати поширені виклики: ${survey.commonChallenges.slice(0,5).map(x=>x.theme||x).join(', ')}`);
    }
    if (Array.isArray(survey.decisionTypes) && survey.decisionTypes.length) {
      recs.push(`Включити приклади рішень: ${survey.decisionTypes.slice(0,5).map(x=>x.theme||x).join(', ')}`);
    }
    if (Array.isArray(survey.learningPreferences) && survey.learningPreferences.length) {
      recs.push('Налаштувати формат під вподобання навчання (кейси, дискусії, hands-on).');
    }
    grouped.surveyBased = recs;
  }

  // From studentClusterAnalysis: adaptation + suggested Ukrainian cases
  const sca = syllabus.analysis?.studentClusterAnalysis || {};
  const adapt = Array.isArray(sca.adaptationRecommendations) ? sca.adaptationRecommendations : [];
  const cases = Array.isArray(sca.suggestedCases) ? sca.suggestedCases : [];
  grouped.clusterAndUkrainianCases = [
    ...adapt.map(a => typeof a === 'string' ? a : (a.title || a.recommendation || JSON.stringify(a))),
    ...cases.slice(0,6).map(c => `Додати український кейс: ${c.company || c.title} (${c.cluster || '—'})`)
  ];

  // Plagiarism-based
  const plag = syllabus.analysis?.plagiarismCheck || {};
  if (Array.isArray(plag.similarSyllabi) && plag.similarSyllabi.length) {
    const top = plag.similarSyllabi[0];
    grouped.plagiarism.push(`Виявлено схожість із силабусом ${top.instructor || 'іншого викладача'} (${top.course || ''}, ${top.year||''}) на ${top.similarity}% — рекомендуємо переробити проблемні розділи, додати оригінальні кейси та завдання.`);
  }

  // Learning Objectives alignment
  const loa = syllabus.analysis?.learningObjectivesAlignment || {};
  if (Array.isArray(loa.missingObjectives) && loa.missingObjectives.length) {
    grouped.learningObjectives.push(`Компенсувати прогалини ILO: ${loa.missingObjectives.slice(0,6).join(', ')}`);
  }
  if (Array.isArray(loa.recommendations) && loa.recommendations.length) {
    grouped.learningObjectives.push(...loa.recommendations.slice(0,6));
  }

  // Template compliance
  const tc = syllabus.analysis?.templateCompliance || {};
  if (Array.isArray(tc.missingElements) && tc.missingElements.length) {
    grouped.templateCompliance.push(`Додати відсутні елементи шаблону: ${tc.missingElements.slice(0,8).join(', ')}`);
  }
  if (Array.isArray(tc.recommendations) && tc.recommendations.length) {
    grouped.templateCompliance.push(...tc.recommendations.slice(0,6));
  }

  // AI Challenger-derived (from discussion and stored suggestions)
  const aiDisc = Array.isArray(syllabus.practicalChallenge?.discussion) ? syllabus.practicalChallenge.discussion : [];
  const aiSug = Array.isArray(syllabus.practicalChallenge?.aiSuggestions) ? syllabus.practicalChallenge.aiSuggestions : [];
  grouped.aiChallenger = [
    ...aiDisc.slice(-3).map(d => (d.aiResponse || '').slice(0,200)).filter(Boolean),
    ...aiSug.slice(0,5).map(s => s.suggestion)
  ];

  return grouped;
}

module.exports = router;
