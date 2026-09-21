const { execFile } = require('child_process');
const http = require('http');
const https = require('https');

const configuration = tool => tool.health_check || tool.mcp_specific?.health_check;

// Legacy declarations contain simple command lines. Never interpret shell syntax.
function commandParts(check) {
  if (Array.isArray(check.args)) {
    if (typeof check.command !== 'string' || !check.args.every(arg => typeof arg === 'string')) {
      throw new Error('Invalid command arguments');
    }
    return [check.command, ...check.args];
  }
  if (typeof check.command !== 'string' || /[|&;<>`$\r\n]/.test(check.command)) {
    throw new Error('Health command requires an executable and safe arguments');
  }
  const parts = check.command.match(/"[^"]*"|'[^']*'|[^\s"']+/g) || [];
  if (parts.join(' ').replace(/\s+/g, '') !== check.command.replace(/\s+/g, '')) {
    throw new Error('Malformed health command');
  }
  return parts.map(part => /^['"]/.test(part) ? part.slice(1, -1) : part);
}

function runCommand(check, signal) {
  const [file, ...args] = commandParts(check);
  if (!file) throw new Error('Missing health executable');
  return new Promise((resolve, reject) => {
    execFile(file, args, { shell: false, windowsHide: true, signal, maxBuffer: 65536,
      killSignal: 'SIGKILL' }, (error, stdout) => {
      if (error) reject(error);
      else resolve(check.expected_output === undefined || stdout.includes(String(check.expected_output)));
    });
  });
}

function runHttp(check, signal) {
  const url = new URL(check.url || check.endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Health endpoint must be HTTP(S) without credentials');
  }
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).get(url, { signal }, res => {
      // No redirects, response-body buffering, or credentials from configuration.
      const valid = res.statusCode === (check.expected_status ?? 200);
      res.destroy();
      resolve(valid);
    });
    req.on('error', reject);
  });
}

/** Explicit execution only. Host adapters must honor signal and return boolean health. */
async function inspectHealth(tool, options = {}) {
  const check = configuration(tool);
  if (options.execute !== true || !check) return { status: 'not_checked', healthy: false };
  const method = check.method || (check.windows || check.unix ? 'platform_commands' : null);
  if (!['command', 'http', 'tool_call', 'platform_commands'].includes(method) ||
      (method === 'tool_call' && typeof options.mcpExecutor !== 'function')) {
    return { status: 'unavailable', healthy: false };
  }
  const timeout = Math.min(30000, Math.max(1, Number(options.timeoutMs ?? check.timeout_ms ?? check.timeout ?? 5000) || 5000));
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  let timer;
  try {
    if (options.signal?.aborted) return { status: 'cancelled', healthy: false };
    const cancellation = new Promise((resolve) => {
      controller.signal.addEventListener('abort', () => resolve(false), { once: true });
    });
    timer = setTimeout(abort, timeout);
    const execute = async () => {
      if (method === 'command') return runCommand(check, controller.signal);
      if (method === 'http') return runHttp(check, controller.signal);
      if (method === 'tool_call') {
        // A caller-provided executor is the authorization boundary; YAML alone cannot call a provider.
        return (await options.mcpExecutor({ toolId: tool.id, command: check.command,
          args: check.args || check.parameters || {}, signal: controller.signal })) === true;
      }
      const commands = check[process.platform === 'win32' ? 'windows' : 'unix'];
      if (!Array.isArray(commands) || !commands.length) return false;
      for (const command of commands) {
        if (controller.signal.aborted || !await runCommand({ command }, controller.signal)) return false;
      }
      return true;
    };
    const healthy = await Promise.race([execute(), cancellation]);
    return { status: controller.signal.aborted ? (options.signal?.aborted ? 'cancelled' : 'timeout')
      : healthy ? 'healthy' : 'unhealthy', healthy: healthy === true && !controller.signal.aborted };
  } catch (error) {
    return { status: controller.signal.aborted ? (options.signal?.aborted ? 'cancelled' : 'timeout') : 'unhealthy',
      healthy: false, reason: error.message };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

module.exports = { configuration, inspectHealth };
