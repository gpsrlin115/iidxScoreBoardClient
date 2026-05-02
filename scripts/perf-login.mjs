import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const previewPort = '4173';
const previewUrl = `http://localhost:${previewPort}/login`;
const reportDir = 'reports/lighthouse';
const chromeFlags = '--headless=new --no-sandbox';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      ...options,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function waitForPreview(url, timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Preview server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for preview server at ${url}`);
}

async function generateReport(format, outputPath) {
  await run(npxCommand, [
    '--yes',
    'lighthouse',
    previewUrl,
    '--only-categories=performance,accessibility,best-practices,seo',
    `--output=${format}`,
    `--output-path=${outputPath}`,
    '--quiet',
    `--chrome-flags=${chromeFlags}`,
  ]);
}

async function main() {
  await mkdir(reportDir, { recursive: true });

  console.log('\n[perf:login] Building production bundle...');
  await run(npmCommand, ['run', 'build']);

  console.log('\n[perf:login] Starting Vite preview...');
  const preview = spawn(
    npmCommand,
    ['run', 'preview', '--', '--host', 'localhost', '--port', previewPort],
    {
      stdio: 'inherit',
      shell: false,
    }
  );

  const shutdownPreview = () => {
    if (!preview.killed) {
      preview.kill('SIGTERM');
    }
  };

  process.on('exit', shutdownPreview);
  process.on('SIGINT', () => {
    shutdownPreview();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    shutdownPreview();
    process.exit(143);
  });

  try {
    await waitForPreview(previewUrl);

    console.log('\n[perf:login] Running Lighthouse JSON report...');
    await generateReport('json', `${reportDir}/login.json`);

    console.log('\n[perf:login] Running Lighthouse HTML report...');
    await generateReport('html', `${reportDir}/login.html`);

    console.log(`\n[perf:login] Reports saved to ${reportDir}/`);
  } finally {
    shutdownPreview();
  }
}

main().catch((error) => {
  console.error(`\n[perf:login] ${error.message}`);
  process.exit(1);
});
