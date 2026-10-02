// Same tasks and rubric in both modes. No invented dollar or savings claims.
const { chat } = require('../src/main/runtime/providers');
const { forRole } = require('../src/renderer/js/role-prompts');
const fs = require('node:fs');
const path = require('node:path');
const tasks = [
  ['Frontend Developer', 'Design a keyboard-accessible sign-up form. Include validation, focus handling and its API contract.'],
  ['Developer', 'Design POST /signup. Include validation, errors, storage and tests. Coordinate with the form contract.'],
  ['DevOps Engineer', 'Design a CI pipeline for a Node and React project. Include test gates, secret handling and rollback.']
];
async function main() {
  const provider = process.env.DESKLY_BENCH_PROVIDER;
  if (!provider) { console.log('Set DESKLY_BENCH_PROVIDER, DESKLY_BENCH_MODEL and optionally DESKLY_BENCH_LIGHT_MODEL, DESKLY_BENCH_KEY, DESKLY_BENCH_URL. This runs six live requests and saves replies for blinded quality review. Compare provider invoices separately for dollar savings.'); return; }
  const report = { createdAt: new Date().toISOString(), provider, runs: [], qualityReview: 'Pending human review: correctness, specificity, security, integration contracts (0–5 each).' };
  for (const mode of ['baseline', 'lightweight']) for (const [role, task] of tasks) {
    const model = mode === 'lightweight' ? process.env.DESKLY_BENCH_LIGHT_MODEL || process.env.DESKLY_BENCH_MODEL : process.env.DESKLY_BENCH_MODEL;
    let usage = null; const started = Date.now();
    const reply = await chat({ provider, model, apiKey: process.env.DESKLY_BENCH_KEY || '', baseUrl: process.env.DESKLY_BENCH_URL || '' }, { system: forRole(role), messages: [{ role: 'user', content: task }], maxTokens: 900 }, undefined, value => { usage = value; });
    report.runs.push({ mode, model: model || 'provider default', role, task, usage, ms: Date.now() - started, reply });
  }
  const destination = path.resolve(process.env.DESKLY_BENCH_OUTPUT || '.cache/agent-benchmark.json'); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, JSON.stringify(report, null, 2)); console.log('Benchmark replies and reported tokens saved to ' + destination + '. Savings are not valid until quality review and invoice comparison.');
}
main().catch(e => { console.error('Benchmark stopped: ' + (e.code || 'provider_failed')); process.exitCode = 1; });
