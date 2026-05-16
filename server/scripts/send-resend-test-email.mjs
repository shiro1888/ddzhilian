import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { Resend } from 'resend';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

loadDotenv({ path: resolve(scriptDirectory, '../.env'), quiet: true });

const resendApiKeyPlaceholder = 're_xxxxxxxxx';

function readEnv(name, fallback = '') {
  return (process.env[name]?.trim() || fallback).trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const apiKey = readEnv('RESEND_API_KEY');
const from = readEnv('RESEND_TEST_FROM', 'onboarding@resend.dev');
const to = readEnv('RESEND_TEST_TO');
const subject = readEnv('RESEND_TEST_SUBJECT', '确认你的 ddzhilian 账号');
const brandName = readEnv('RESEND_TEST_BRAND_NAME', 'ddzhilian');
const actionUrl = readEnv('RESEND_TEST_ACTION_URL', 'https://ddzhilian.com/auth/confirm');
const supportEmail = readEnv('RESEND_TEST_SUPPORT_EMAIL', 'support@ddzhilian.com');
const templatePath = resolve(
  scriptDirectory,
  '..',
  readEnv('RESEND_TEST_TEMPLATE_PATH', 'email-templates/resend-email-confirmation.html'),
);

if (!apiKey || apiKey === resendApiKeyPlaceholder) {
  fail(
    [
      'Missing RESEND_API_KEY.',
      'Open server/.env and replace RESEND_API_KEY=re_xxxxxxxxx with your real Resend API key.',
    ].join('\n'),
  );
}

if (!to) {
  fail('Missing RESEND_TEST_TO. Set the recipient email in server/.env before running this test.');
}

const resend = new Resend(apiKey);

try {
  const templateHtml = await readFile(templatePath, 'utf8');
  const html = renderTemplate(templateHtml, {
    actionUrl,
    brandName,
    currentYear: new Date().getFullYear().toString(),
    recipientEmail: to,
    supportEmail,
  });

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });

  if (error) {
    fail(`Resend email send failed:\n${JSON.stringify(error, null, 2)}`);
  }

  console.log(`Resend test email accepted. id=${data?.id ?? 'unknown'} to=${to} from=${from}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail(`Resend email send failed:\n${message}`);
}

function renderTemplate(template, values) {
  return Object.entries(values).reduce(
    (html, [name, value]) => html.replaceAll(`{{${name}}}`, escapeHtml(value)),
    template,
  );
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
