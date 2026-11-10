'use strict';

const { CodexSessionObserver } = require('../../.aexos-core/core/virtual-office/codex-observer');
const [projectRoot, sessionsRoot] = process.argv.slice(2);
const deadline = setTimeout(() => { process.exitCode = 1; process.disconnect(); }, 20000);
const reader = new CodexSessionObserver(projectRoot, { sessionsRoot, submit: async () => {
  await new Promise((resolve) => {
    process.once('message', resolve);
    process.send({ code: 'SUBMISSION_HELD' });
  });
  return { accepted: true };
} });
reader.scan().then((result) => {
  clearTimeout(deadline);
  process.send({ code: 'SCAN_COMPLETE', result }, () => process.disconnect());
}).catch(() => { clearTimeout(deadline); process.exitCode = 1; process.disconnect(); });
