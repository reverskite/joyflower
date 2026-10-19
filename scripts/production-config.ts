import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inquiryPrivacy } from '../lib/inquiry-privacy.mjs';
import { getSiteOrigin } from '../lib/seo.ts';
import { operationVars } from './operation-config.ts';

type ProductionSettings = {
  workerName: string;
  workersSubdomain: string;
  accountId: string;
  databaseName: string;
  databaseId: string;
  siteUrl?: string;
};

export function adminAccessConfig(value: unknown, siteUrl: string): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid admin Access settings.');
  const record = value as Record<string, unknown>;
  const fields = ['teamDomain', 'audience', 'emails', 'hostname'];
  if (Object.keys(record).some(key => !fields.includes(key)) || fields.some(key => typeof record[key] !== 'string'))
    throw new Error('Admin Access settings require only the four server configuration fields.');
  const settings = record as { teamDomain: string; audience: string; emails: string; hostname: string };
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(settings.teamDomain) ||
      !/^[a-f0-9]{64}$/.test(settings.audience) || settings.hostname !== new URL(siteUrl).hostname ||
      !/^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/.test(settings.emails))
    throw new Error('Admin Access settings must match the production hostname and one valid administrator email.');
  return { ADMIN_ACCESS_TEAM_DOMAIN: settings.teamDomain, ADMIN_ACCESS_AUDIENCE: settings.audience,
    ADMIN_ACCESS_EMAILS: settings.emails.toLowerCase() };
}

// Identifiers only. API secrets never belong in these files.
export function productionConfig(value: unknown, adminAccess?: unknown, operations?: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid production settings.');
  const fields = ['workerName', 'workersSubdomain', 'accountId', 'databaseName', 'databaseId'];
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => ![...fields, 'siteUrl'].includes(key)) ||
      fields.some(key => typeof record[key] !== 'string' || !record[key]))
    throw new Error('Production settings require the five identifiers and an optional public siteUrl; secrets are not accepted.');
  const settings = record as ProductionSettings;
  const slug = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!slug.test(settings.workerName) || !slug.test(settings.workersSubdomain) ||
      settings.workerName.startsWith('site-creator-'))
    throw new Error('Set a production Worker name and workers.dev subdomain.');
  if (!/^[a-f0-9]{32}$/i.test(settings.accountId) || /^0+$/.test(settings.accountId))
    throw new Error('Set the actual Cloudflare account ID.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(settings.databaseName) ||
      settings.databaseName === 'site-creator-d1')
    throw new Error('Set a dedicated production D1 name.');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(settings.databaseId) ||
      settings.databaseId === '00000000-0000-4000-8000-000000000000' ||
      settings.databaseId === '00000000-0000-0000-0000-000000000000')
    throw new Error('Set the actual production D1 ID; development placeholders are forbidden.');
  const workersOrigin = `https://${settings.workerName}.${settings.workersSubdomain}.workers.dev`;
  if (settings.siteUrl !== undefined && typeof settings.siteUrl !== 'string')
    throw new Error('Production siteUrl must be a public HTTPS origin.');
  const siteUrl = settings.siteUrl === undefined ? workersOrigin : getSiteOrigin(settings.siteUrl);
  if (!siteUrl || (settings.siteUrl !== undefined && ![siteUrl, `${siteUrl}/`].includes(settings.siteUrl)) ||
      (new URL(siteUrl).hostname.endsWith('.workers.dev') && siteUrl !== workersOrigin))
    throw new Error('Set a public HTTPS origin without credentials, paths, ports or queries; another workers.dev host is forbidden.');
  const customDomain = siteUrl !== workersOrigin;
  return {
    siteUrl,
    worker: {
      name: settings.workerName,
      account_id: settings.accountId,
      main: './build/sites-worker.ts',
      compatibility_date: '2026-05-15',
      compatibility_flags: ['nodejs_compat'],
      workers_dev: !customDomain,
      preview_urls: false,
      ...(customDomain ? { routes: [{ pattern: new URL(siteUrl).hostname, custom_domain: true }] } : {}),
      d1_databases: [{ binding: 'DB', database_name: settings.databaseName,
        database_id: settings.databaseId,
        migrations_dir: fileURLToPath(new URL('../drizzle', import.meta.url)) }],
      vars: {
        ...(adminAccess === undefined ? {} : adminAccessConfig(adminAccess, siteUrl)),
        INQUIRY_INTAKE_ENABLED: 'false',
        INQUIRY_LOCAL_TEST_MODE: 'false',
        INQUIRY_PRIVACY_VERSION: inquiryPrivacy.version,
        INQUIRY_RETENTION_NOTICE: inquiryPrivacy.retention,
        INQUIRY_PRIVACY_CONTACT: inquiryPrivacy.contact,
        ADMIN_ENABLED: 'false',
        INQUIRY_NOTIFICATION_MODE: 'disabled',
        SMS_SEND_ENABLED: 'false',
        ...(operations === undefined ? {} : operationVars(operations, new URL(siteUrl).hostname, adminAccess !== undefined)),
      },
    },
  };
}

export function readProductionConfig(file = new URL('../deployment/production.json', import.meta.url),
  adminFile = new URL('../deployment/admin-access.json', import.meta.url),
  operationsFile = new URL('../deployment/operations.json', import.meta.url)) {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    throw new Error('Missing deployment/production.json. See deployment/README.md; no deployment was attempted.');
  }
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error('Production settings must be valid JSON.'); }
  const config = productionConfig(value);
  let operations: unknown;
  if (existsSync(operationsFile)) {
    try { operations = JSON.parse(readFileSync(operationsFile, 'utf8')); }
    catch { throw new Error('Invalid deployment/operations.json; no deployment was attempted.'); }
  }
  let adminAccess: unknown;
  if (existsSync(adminFile)) {
    try { adminAccess = JSON.parse(readFileSync(adminFile, 'utf8')); }
    catch { throw new Error('Invalid deployment/admin-access.json; no deployment was attempted.'); }
    const settings = value as ProductionSettings;
    const legacyOrigin = `https://${settings.workerName}.${settings.workersSubdomain}.workers.dev`;
    // An existing workers.dev Access application does not protect a new domain.
    // Preserve its file, validate it, and omit its runtime settings during migration.
    // Legacy Access cannot authorize a staged activation on the official domain.
    if (!config.worker.workers_dev && adminAccess && typeof adminAccess === 'object' &&
        (adminAccess as Record<string, unknown>).hostname === new URL(legacyOrigin).hostname) {
      adminAccessConfig(adminAccess, legacyOrigin);
      console.warn('Legacy workers.dev Access settings were not applied to the custom domain. ADMIN_ENABLED remains false.');
      return productionConfig(value, undefined, operations);
    }
  }
  return productionConfig(value, adminAccess, operations);
}
