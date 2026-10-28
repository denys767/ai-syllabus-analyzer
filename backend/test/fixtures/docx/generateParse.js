#!/usr/bin/env node
// Генератор синтетичного DOCX для тестів парсера треку 2 (вигаданий курс, без даних реальних викладачів).
// Запуск: node test/fixtures/docx/generateParse.js  (з каталогу backend). Результат комітиться.
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = require('docx');

const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
const p = (text) => new Paragraph({ children: [new TextRun(text)] });
const bullet = (text) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun(text)] });
const cell = (text) => new TableCell({ width: { size: 2200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun(text)] })] });
const row = (...cells) => new TableRow({ children: cells.map(cell) });

async function build() {
  const doc = new Document({
    creator: 'KSE test fixtures',
    sections: [{
      children: [
        h1('Negotiation and Influence Course Syllabus'),
        h1('1. Summary'),
        p('Course Title: Negotiation and Influence'),
        p('Prerequisites: none'),
        p('Short Course Description: Negotiation is part of every manager’s week. This course gives you a practical toolkit for preparing, running and reviewing negotiations with clients, partners and teams.'),
        p('Course Objectives: The course helps you to understand negotiation.'),
        p('Learning Outcomes:'),
        bullet('Apply a preparation framework to a real negotiation'),
        bullet('Be familiar with influence tactics'),
        p('Connection to Capstone Project: The course helps you to negotiate resources and scope for your capstone project with its stakeholders.'),
        h1('2. Instructor'),
        p('Jane Doe'),
        p('Associate professor of management'),
        p('E-mail: jane.doe@example.org'),
        p('Areas of Expertise:'),
        bullet('Negotiation'),
        bullet('Organisational behaviour'),
        h1('3. Course Structure & Schedule'),
        new Table({ rows: [
          row('Date', 'Topic', 'Format', 'Additional information'),
          row('March 7, 2026 | 9.30 – 12.20 (4 ac. hours)', 'Preparing a negotiation', 'online', 'Required reading: Getting to Yes, ch. 1'),
          row('March 8, 2026 | 9.30 – 12.20 (4 ac. hours)', 'Influence and persuasion', 'online', ''),
          row('March 14, 2026 | 9.30 – 11.10 (2 ac. hours)', 'Negotiation simulation', 'online', ''),
        ] }),
        p('Individual work:'),
        p('Reading of the mandatory materials (3 hours)'),
        p('Preparation for the final negotiation (5 hours)'),
        h1('4. Assessment and Grading'),
        new Table({ rows: [
          row('Assessment Component', 'Weight (%)', 'Performance Criteria', 'Deadline'),
          row('Class participation', '20', 'Active contribution to discussions and simulations.', 'Throughout the course'),
          row('Negotiation simulation', '30', 'Quality of preparation and of the agreement reached.', '14.03.26'),
          row('Final negotiation plan', '50', 'A negotiation plan for a real case, with a BATNA analysis.', '28.03.26'),
        ] }),
        h1('5. Course Materials'),
        p('Required Readings/Materials:'),
        p('Fisher R., Ury W. Getting to Yes. Penguin, 2011.'),
        p('Recommended:'),
        p('Cialdini R. Influence: The Psychology of Persuasion. Harper Business, 2021.'),
        h1('6. Course Policies'),
        p('Attendance is mandatory. If a student misses more than 40% of classes, they will be required to retake the course unless explicitly agreed otherwise with the instructor.'),
        p('Work submitted late is accepted until the next class, with a lower maximum score.'),
        p('To pass the course a student must earn at least 60 points out of 100.'),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

if (require.main === module) {
  build().then((buf) => fs.writeFileSync(path.join(__dirname, 'parse-syllabus.docx'), buf)).catch((err) => { console.error(err); process.exit(1); });
}
module.exports = { build };
