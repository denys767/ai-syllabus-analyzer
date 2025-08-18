const nodemailer = require('nodemailer');

// Prefer Gmail; fall back to generic SMTP if provided
function createTransporter() {
  const {
    GMAIL_USER,
    GMAIL_PASS,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
  } = process.env;

  if (GMAIL_USER && GMAIL_PASS) {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_PASS,
      },
    });
  }

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: String(SMTP_SECURE).toLowerCase() === 'true' || Number(SMTP_PORT) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }

  throw new Error('Email transporter is not configured. Set GMAIL_USER/GMAIL_PASS or SMTP_* env vars.');
}

let transporter;
try {
  transporter = createTransporter();
} catch (e) {
  console.warn('Email service disabled:', e.message);
}

const getFromAddress = () =>
  process.env.EMAIL_FROM || process.env.GMAIL_USER || 'no-reply@ai-syllabus-analyzer.local';

async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    console.warn('sendMail skipped: transporter not configured');
    return { skipped: true };
  }
  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text: text || html?.replace(/<[^>]+>/g, ''),
    html,
  });
  return info;
}

function buildFrontendUrl(pathWithQuery) {
  const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
}

async function sendVerificationEmail(email, token) {
  const url = buildFrontendUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  const subject = 'Підтвердження електронної пошти — KSE AI Syllabus Analyzer';
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#333">
      <h2>Підтвердження електронної пошти</h2>
      <p>Дякуємо за реєстрацію. Будь ласка, підтвердіть вашу електронну пошту, натиснувши кнопку нижче:</p>
      <p style="margin:24px 0">
        <a href="${url}" style="background:#1976d2;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;display:inline-block">Підтвердити email</a>
      </p>
      <p>Або перейдіть за посиланням: <a href="${url}">${url}</a></p>
      <hr/>
      <p style="font-size:12px;color:#666">Якщо ви не створювали обліковий запис, проігноруйте цей лист.</p>
    </div>
  `;
  return sendMail({ to: email, subject, html });
}

async function sendPasswordResetEmail(email, token) {
  const url = buildFrontendUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  const subject = 'Скидання паролю — KSE AI Syllabus Analyzer';
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#333">
      <h2>Скидання паролю</h2>
      <p>Ми отримали запит на скидання паролю для цього email. Натисніть кнопку, щоб встановити новий пароль (посилання дійсне 1 годину):</p>
      <p style="margin:24px 0">
        <a href="${url}" style="background:#1976d2;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;display:inline-block">Скинути пароль</a>
      </p>
      <p>Або перейдіть за посиланням: <a href="${url}">${url}</a></p>
      <hr/>
      <p style="font-size:12px;color:#666">Якщо ви не надсилали цей запит, можете проігнорувати цей лист.</p>
    </div>
  `;
  return sendMail({ to: email, subject, html });
}

async function sendAccountDeletionEmail(email) {
  const subject = 'Підтвердження видалення акаунта — KSE AI Syllabus Analyzer';
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#333">
      <h2>Ваш акаунт було видалено</h2>
      <p>Ваш акаунт у системі KSE AI Syllabus Analyzer успішно видалено разом із пов'язаними даними.</p>
      <p>Якщо це були не ви, негайно зв'яжіться з адміністратором системи.</p>
    </div>
  `;
  return sendMail({ to: email, subject, html });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAccountDeletionEmail,
};
