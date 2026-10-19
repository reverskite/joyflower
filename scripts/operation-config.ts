export const operationEvidenceKeys = ['access', 'turnstile', 'workerSecrets', 'privacy', 'backupRestore', 'retentionProcedure'] as const;
type EvidenceKey = typeof operationEvidenceKeys[number];
export type OperationPlan = {
  stage: 'closed' | 'admin-only' | 'intake';
  activationApproval: string;
  turnstileSiteKey: string;
  evidence: Record<EvidenceKey, string>;
};

// This contains public settings and verification references, never credentials.
export function operationPlan(value: unknown): OperationPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid operation plan.');
  const record = value as Record<string, unknown>;
  const keys = ['stage', 'activationApproval', 'turnstileSiteKey', 'evidence'];
  if (Object.keys(record).length !== keys.length || Object.keys(record).some(key => !keys.includes(key)) ||
      !['closed', 'admin-only', 'intake'].includes(String(record.stage)) ||
      typeof record.activationApproval !== 'string' || typeof record.turnstileSiteKey !== 'string' ||
      !record.evidence || typeof record.evidence !== 'object' || Array.isArray(record.evidence))
    throw Error('Operation plan accepts only stage, activationApproval, public sitekey and evidence.');
  const evidence = record.evidence as Record<string, unknown>;
  if (Object.keys(evidence).length !== operationEvidenceKeys.length ||
      operationEvidenceKeys.some(key => typeof evidence[key] !== 'string') ||
      Object.keys(evidence).some(key => !operationEvidenceKeys.includes(key as EvidenceKey)) ||
      Object.values(evidence).some(v => (v as string).length > 1000) || record.activationApproval.length > 1000)
    throw Error('Operation evidence must contain the six bounded verification references.');
  if (record.turnstileSiteKey && (!/^[A-Za-z0-9_-]{10,100}$/.test(record.turnstileSiteKey) || /^[123]x0+/.test(record.turnstileSiteKey)))
    throw Error('Use a real public Turnstile sitekey; secret and test keys are not accepted.');
  return value as OperationPlan;
}

export function operationBlockers(plan: OperationPlan, accessConfigured: boolean, target: 'admin-only' | 'intake') {
  const missing: string[] = [];
  if (!plan.activationApproval.trim()) missing.push('activationApproval');
  if (!accessConfigured) missing.push('officialDomainAccess');
  const required: readonly EvidenceKey[] = target === 'admin-only' ? ['access'] : operationEvidenceKeys;
  for (const key of required) if (!plan.evidence[key].trim()) missing.push(key);
  if (target === 'intake' && !plan.turnstileSiteKey) missing.push('turnstileSiteKey');
  return missing;
}

export function operationVars(value: unknown, hostname: string, accessConfigured: boolean): Record<string, string> {
  const plan = operationPlan(value);
  const vars: Record<string, string> = {};
  if (plan.turnstileSiteKey) Object.assign(vars, { TURNSTILE_SITE_KEY: plan.turnstileSiteKey, TURNSTILE_HOSTNAME: hostname });
  if (plan.stage === 'closed') return vars;
  const blockers = operationBlockers(plan, accessConfigured, plan.stage);
  if (blockers.length) throw Error(`Operation activation blocked: ${blockers.join(', ')}. No build or deployment attempted.`);
  vars.ADMIN_ENABLED = 'true';
  if (plan.stage === 'intake') vars.INQUIRY_INTAKE_ENABLED = 'true';
  // Sender and local-test flags are deliberately not configurable here.
  return vars;
}
