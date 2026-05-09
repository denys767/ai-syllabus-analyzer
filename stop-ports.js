#!/usr/bin/env node

const { exec } = require('child_process');

const defaultPorts = [3000, 5000];
const dryRun = process.argv.includes('--dry-run');
const requestedPorts = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith('--'))
  .map((arg) => Number(arg))
  .filter((port) => Number.isInteger(port) && port > 0);
const ports = requestedPorts.length > 0 ? requestedPorts : defaultPorts;

function run(command) {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true }, (error, stdout, stderr) => {
      if (error && !stdout) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function parseWindowsNetstatOutput(stdout, port) {
  const pids = new Set();

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.toLowerCase().startsWith('proto')) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) {
      continue;
    }

    const localAddress = parts[1];
    const pid = parts[parts.length - 1];
    if (localAddress && localAddress.endsWith(`:${port}`) && /^\d+$/.test(pid)) {
      pids.add(pid);
    }
  }

  return [...pids];
}

async function getPidsForPort(port) {
  if (process.platform === 'win32') {
    const { stdout } = await run('netstat -ano -p tcp');
    return parseWindowsNetstatOutput(stdout, port);
  }

  try {
    const { stdout } = await run(`lsof -ti tcp:${port}`);
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d+$/.test(line));
  } catch (error) {
    try {
      const { stdout } = await run(`ss -lptn 'sport = :${port}'`);
      const pids = new Set();
      const matches = stdout.matchAll(/pid=(\d+)/g);
      for (const match of matches) {
        pids.add(match[1]);
      }
      return [...pids];
    } catch (fallbackError) {
      throw new Error(`Unable to inspect port ${port}: ${fallbackError.message}`);
    }
  }
}

async function killPid(pid) {
  if (process.platform === 'win32') {
    await run(`taskkill /PID ${pid} /F`);
    return;
  }

  await run(`kill -9 ${pid}`);
}

async function stopPort(port) {
  const pids = await getPidsForPort(port);

  if (pids.length === 0) {
    console.log(`Port ${port}: no running process found.`);
    return;
  }

  if (dryRun) {
    console.log(`Port ${port}: would stop PID(s) ${pids.join(', ')}.`);
    return;
  }

  for (const pid of pids) {
    await killPid(pid);
  }

  console.log(`Port ${port}: stopped PID(s) ${pids.join(', ')}.`);
}

async function main() {
  console.log(`Stopping processes on ports ${ports.join(', ')}${dryRun ? ' (dry run)' : ''}...`);

  for (const port of ports) {
    await stopPort(port);
  }

  console.log('Done.');
}

main().catch((error) => {
  console.error('Failed to stop ports:', error.message);
  process.exitCode = 1;
});