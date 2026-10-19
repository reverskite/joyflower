import { readFile } from 'node:fs/promises';
import { readProductionConfig, adminAccessConfig } from './production-config.ts';
import { operationPlan, operationBlockers } from './operation-config.ts';

const config = readProductionConfig();
const plan = operationPlan(JSON.parse(await readFile(new URL('../deployment/operations.json', import.meta.url), 'utf8')));
const access = JSON.parse(await readFile(new URL('../deployment/admin-access.json', import.meta.url), 'utf8'));
let accessConfigured = false;
try { adminAccessConfig(access, config.siteUrl); accessConfigured = true; } catch { /* Report safely, without credential values. */ }
const result = { stage: plan.stage, siteUrl: config.siteUrl, operatingFlags: {
  admin: config.worker.vars.ADMIN_ENABLED, intake: config.worker.vars.INQUIRY_INTAKE_ENABLED,
  notifications: config.worker.vars.INQUIRY_NOTIFICATION_MODE, sms: config.worker.vars.SMS_SEND_ENABLED,
  localBypass: config.worker.vars.INQUIRY_LOCAL_TEST_MODE },
  adminActivationBlockers: operationBlockers(plan, accessConfigured, 'admin-only'),
  intakeActivationBlockers: operationBlockers(plan, accessConfigured, 'intake') };
console.log(JSON.stringify(result, null, 2));
// Closed preparation is expected. --require-ready is for a future release gate.
if (process.argv.includes('--require-ready') && result.intakeActivationBlockers.length) process.exitCode = 1;
