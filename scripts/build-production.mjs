import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readProductionConfig } from './production-config.ts';

// Validate before invoking the build, so missing settings leave dist untouched.
try {
  const config = readProductionConfig();
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('./run-framework.mjs', import.meta.url)), 'build',
  ], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    stdio: 'inherit',
    env: { ...process.env, JOYFLOWER_BUILD_TARGET: 'production',
      NEXT_PUBLIC_SITE_URL: config.siteUrl },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Production build failed.');
  process.exitCode = 1;
}
