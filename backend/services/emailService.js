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
  console.log('Email transporter initialized successfully');
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
  
  try {
    console.log(`Attempting to send email to: ${to}, subject: ${subject}`);
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to,
      subject,
      text: text || html?.replace(/<[^>]+>/g, ''),
      html,
    });
    console.log(`Email sent successfully to ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error.message);
    throw error;
  }
}

function buildFrontendUrl(pathWithQuery) {
  const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
}

// Єдиний лист-запрошення: користувач переходить за посиланням встановлення паролю.
// Після встановлення паролю бекенд також автоматично верифікує email (isVerified=true).
// Таким чином один токен = і підтвердження пошти, і первинне задання паролю.
async function sendInvitationEmail(email, resetToken) {
  const setPasswordUrl = buildFrontendUrl(`/reset-password?token=${encodeURIComponent(resetToken)}`);
  const subject = 'Ваш обліковий запис створено — встановіть пароль та активуйте доступ';
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#333">
      <h2>Ласкаво просимо до KSE AI Syllabus Analyzer</h2>
      <p>Адміністратор створив для вас обліковий запис. Щоб активувати його, встановіть власний пароль. Після цього ваш email буде автоматично підтверджено.</p>
      <p style="margin:24px 0">
        <a href="${setPasswordUrl}" style="background:#1976d2;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;display:inline-block">Встановити пароль</a>
      </p>
  <p>Посилання дійсне 24 години. Якщо воно протерміноване — скористайтесь опцією "Забули пароль" на сторінці входу.</p>
      <p>Посилання: <a href="${setPasswordUrl}">${setPasswordUrl}</a></p>
      <hr/>
      <p style="font-size:12px;color:#666">Якщо ви не очікували цей лист — проігноруйте його.</p>
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
  <p>Ми отримали запит на скидання паролю для цього email. Натисніть кнопку, щоб встановити новий пароль (посилання дійсне 24 години):</p>
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
  sendInvitationEmail,
  sendPasswordResetEmail,
  sendAccountDeletionEmail,
};
