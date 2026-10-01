// Use the user's installed, signed-in coding CLI as a model transport. Deskly
// still owns the tool loop, file boundaries, and every approval decision.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = {
  codex_cli: { label: 'Codex CLI (installed login)', command: 'codex' },
  claude_code: { label: 'Claude Code (installed login)', command: process.platform === 'win32' ? 'claude.cmd' : 'claude' }
};

function commandFor(profile) {
  const def = CLI[profile.provider];
  if (!def) throw new Error('Unknown local CLI provider.');
  const model = String(profile.model || '').trim();
  if (model && !/^[a-zA-Z0-9._\/-]{1,100}$/.test(model)) throw new Error('Model name contains unsupported characters.');
  if (profile.provider === 'codex_cli') return { command: def.command, args: ['exec', '--json', '--ephemeral', '--ignore-user-config', '--sandbox', 'read-only', '--skip-git-repo-check', ...(model ? ['--model', model] : []), '-'] };
  return { command: def.command, args: ['-p', '--output-format', 'json', '--no-session-persistence', '--restricted', '--tools', '', '--permission-mode', 'plan', ...(model ? ['--model', model] : [])] };
}

function resolveExecutable(command) {
  if (process.platform !== 'win32' || !command.endsWith('.cmd')) return command;
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue;
    const shim = path.join(directory, command);
    const direct = path.join(directory, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
    if (fs.existsSync(shim) && fs.existsSync(direct)) return direct;
  }
  return command;
}

function parseCliOutput(provider, stdout) {
  if (provider === 'claude_code') {
    const result = JSON.parse(stdout.trim());
    if (result.is_error || result.type === 'error') throw new Error(result.result || result.error?.message || 'Claude Code did not complete the request.');
    const usage = result.usage || {};
    return { text: String(result.result || '').trim(), usage: { input: usage.input_tokens || 0, output: usage.output_tokens || 0, cached: usage.cache_read_input_tokens || 0 } };
  }
  let message = '', usage = {}, completed = false;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event; try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') message = event.item.text || message;
    if (event.type === 'turn.completed') {
      completed = true;
      const u = event.usage || {};
      usage = { input: u.input_tokens || 0, output: u.output_tokens || 0, cached: u.cached_input_tokens || 0 };
    }
    if (event.type === 'turn.failed') throw new Error(event.error?.message || 'Codex did not complete the request.');
  }
  if (!completed || !message.trim()) throw new Error('Codex finished without a usable reply.');
  return { text: message.trim(), usage };
}

function runProcess(command, args, { input = '', signal, timeoutMs = 240000, cwd, includeStderr = false } = {}) {
  return new Promise((resolve, reject) => {
    let child, stdout = '', stderr = '', done = false;
    const finish = (err, value) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (err) reject(err); else resolve(value);
    };
    const stop = () => {
      if (!child?.pid) return;
      if (process.platform === 'win32' && child.spawnfile?.toLowerCase().endsWith('cmd.exe')) {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
      } else child.kill();
    };
    const abort = () => { stop(); finish(Object.assign(new Error('Cancelled'), { code: 'cancelled' })); };
    const timer = setTimeout(() => { stop(); finish(new Error('Local CLI timed out. The task can be resumed.')); }, timeoutMs);
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    try {
      // Windows cannot launch npm's .cmd shim directly. Only fixed CLI flags
      // and a validated model name enter this command line; the prompt is stdin.
      const resolved = resolveExecutable(command);
      const windowsShim = process.platform === 'win32' && resolved.endsWith('.cmd');
      const executable = windowsShim ? (process.env.ComSpec || 'cmd.exe') : command;
      const launchArgs = windowsShim ? ['/d', '/c', `${command} ${args.map(arg => arg === '' ? '""' : arg).join(' ')}`] : args;
      const env = { ...process.env };
      for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'CODEX_ACCESS_TOKEN']) delete env[key];
      child = spawn(windowsShim ? executable : resolved, launchArgs, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) { finish(e); return; }
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 3000000) { child.kill(); finish(new Error('Local CLI output exceeded the limit.')); } });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.on('error', e => finish(new Error(`Could not start ${command}. Install it and sign in first. ${e.message}`)));
    child.on('close', code => code === 0 ? finish(null, includeStderr ? `${stdout}\n${stderr}` : stdout) : finish(new Error(`${command} exited with code ${code}. ${stderr.trim().slice(-700)}`)));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function chatCli(profile, input, signal, onUsage, run = runProcess) {
  const { command, args } = commandFor(profile);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'deskly-cli-'));
  const prompt = `You are supplying one model response to Deskly. Do not use your own tools or inspect the filesystem. Deskly runs tools and handles approvals separately.\n\nSYSTEM INSTRUCTIONS:\n${input.system}\n\nCONVERSATION:\n${input.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}\n\nRespond to the last message only. If it requests JSON, reply with exactly that JSON object.`;
  try {
    const stdout = await run(command, args, { input: prompt, signal, cwd: scratch });
    const result = parseCliOutput(profile.provider, stdout);
    if (!result.text) throw new Error('The local CLI returned an empty reply.');
    onUsage?.(result.usage);
    return result.text;
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}

async function testCli(profile, run = runProcess) {
  const { command } = commandFor(profile);
  const args = profile.provider === 'codex_cli' ? ['login', 'status'] : ['auth', 'status'];
  const start = Date.now();
  const output = await run(command, args, { timeoutMs: 15000, includeStderr: true });
  if (profile.provider === 'claude_code' && !JSON.parse(output).loggedIn) throw new Error('Claude Code is installed but not signed in. Run claude in a terminal and sign in.');
  if (profile.provider === 'codex_cli' && !/logged in/i.test(output)) throw new Error('Codex is installed but not signed in. Run codex login in a terminal.');
  return { ok: true, ms: Date.now() - start, sample: `${CLI[profile.provider].label} is signed in` };
}

module.exports = { CLI, commandFor, parseCliOutput, chatCli, testCli };
