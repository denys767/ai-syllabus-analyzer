const { createResponse, llmModel } = require('./client');

function serializeIssueContext(issue) {
  if (!issue) return 'No specific issue is active right now.';

  const header = `Current issue: (${issue.category} / ${issue.priority}) ${issue.title}\nDescription: ${issue.description}`;
  const ba = issue.beforeAfter;
  if (!ba) return header;

  if (ba.kind === 'choice') {
    const opts = (ba.payload?.options || []).map((o, i) => {
      const sample = (o.edits || [])
        .filter((e) => e.action !== 'delete')
        .map((e) => String(e.newText || ''))
        .filter(Boolean)
        .join(' ')
        .slice(0, 280);
      return `  Option ${i + 1} — ${o.label}: ${sample}${o.rationale ? ` [Rationale: ${o.rationale}]` : ''}`;
    }).join('\n');
    return `${header}\n\nThis is a POLICY issue. The instructor must choose one of these options:\n${opts || '(no options generated yet)'}`;
  }

  if (ba.kind === 'case-cards') {
    const cards = (ba.payload?.cards || []).map((c, i) =>
      `  Case ${i + 1} — ${c.title} (${c.sourceLabel}): ${c.summary}`
    ).join('\n');
    return `${header}\n\nThis is a CASE recommendation. Available case suggestions:\n${cards || '(no cases generated yet)'}`;
  }

  // before-after
  const before = ba.before
    ? `Current syllabus text:\n"""\n${ba.before}\n"""\n\nProposed replacement:\n"""\n${ba.after}\n"""`
    : `Proposed addition (section currently missing):\n"""\n${ba.after}\n"""`;
  return `${header}\n\n${before}`;
}

async function chatReply(syllabus, recentMessages, userText, currentIssue) {
  const transcript = (recentMessages || []).slice(-8).map((m) => {
    const speaker = m.role === 'ai' ? 'AI' : m.role === 'user' ? 'Instructor' : 'System';
    return `${speaker}: ${m.content || ''}`;
  }).join('\n');

  const issueContext = serializeIssueContext(currentIssue);

  const prompt = `You are Professor's Tutor, helping an MBA instructor at KSE Business School improve a syllabus. Be concise (2-4 sentences), specific, and reference the issue details below when relevant.

${issueContext}

Recent conversation:
${transcript}

Instructor just said: ${userText}

Reply directly to the instructor.`;

  const resp = await createResponse({
    model: llmModel,
    input: [
      { role: 'system', content: 'You are a focused, encouraging syllabus coach. Be brief and concrete.' },
      { role: 'user', content: prompt },
    ],
  });
  return (resp.output_text || '').trim();
}

module.exports = { chatReply, serializeIssueContext };
