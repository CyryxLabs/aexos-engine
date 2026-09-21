const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const yaml = require('js-yaml');
const resolver = require('../../.aexos-core/infrastructure/scripts/tool-resolver');

describe('explicit tool health execution', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-tool-health-'));
    resolver.clearCache();
    resolver.setSearchPaths([root]);
  });
  afterEach(() => {
    resolver.clearCache();
    resolver.resetSearchPaths();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const command = (code, extra = {}) => ({ health_check: {
    method: 'command', command: process.execPath, args: ['-e', code], ...extra,
  } });
  function definition(check) {
    fs.writeFileSync(path.join(root, 'fixture.yaml'), yaml.dump({ tool: {
      id: 'fixture', name: 'Fixture', type: 'cli', version: '1.0.0', description: 'Health fixture', ...check,
    } }));
  }

  test('resolution never executes YAML commands and explicitly checked health is not cached', async () => {
    const marker = path.join(root, 'effect.txt');
    definition(command(`require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`));
    expect((await resolver.resolveTool('fixture'))._healthStatus).toBe('not_checked');
    expect(fs.existsSync(marker)).toBe(false);
    expect((await resolver.resolveTool('fixture', { health: { execute: true } }))._healthStatus).toBe('healthy');
    expect(fs.readFileSync(marker, 'utf8')).toBe('ran');
    fs.unlinkSync(marker);
    expect((await resolver.resolveTool('fixture'))._healthStatus).toBe('not_checked');
    expect(fs.existsSync(marker)).toBe(false);
    expect((await resolver.resolveTool('fixture', { health: { execute: true } }))._healthStatus).toBe('healthy');
    expect(fs.existsSync(marker)).toBe(true);
  });

  test('command exit, expected output and timeout use real processes', async () => {
    expect(await resolver.checkHealth(command('console.log("ready")', { expected_output: 'ready' }), { execute: true })).toBe(true);
    expect(await resolver.checkHealth(command('process.exit(7)'), { execute: true })).toBe(false);
    expect(await resolver.checkHealth(command('console.log("wrong")', { expected_output: 'ready' }), { execute: true })).toBe(false);
    expect((await resolver.inspectHealth(command('setTimeout(()=>{}, 5000)'), { execute: true, timeoutMs: 80 })).status).toBe('timeout');
  });

  test('shell metacharacters never execute and missing executables fail', async () => {
    const marker = path.join(root, 'injected');
    expect(await resolver.checkHealth({ health_check: { method: 'command', command: `echo ok > ${marker}` } }, { execute: true })).toBe(false);
    expect(fs.existsSync(marker)).toBe(false);
    expect(await resolver.checkHealth({ health_check: { method: 'command', command: 'aexos-does-not-exist-123' } }, { execute: true })).toBe(false);
  });

  test('required nested checks fail closed and need a positive explicit host executor', async () => {
    definition({ mcp_specific: { health_check: { method: 'tool_call', command: 'ping', required: true } } });
    await expect(resolver.resolveTool('fixture')).rejects.toThrow('not_checked');
    await expect(resolver.resolveTool('fixture', { health: { execute: true } })).rejects.toThrow('unavailable');
    const calls = [];
    const health = { execute: true, mcpExecutor: async request => { calls.push(request); return true; } };
    expect((await resolver.resolveTool('fixture', { health }))._healthStatus).toBe('healthy');
    expect(calls[0]).toMatchObject({ toolId: 'fixture', command: 'ping', args: {} });
    await expect(resolver.resolveTool('fixture')).rejects.toThrow('not_checked');
    health.mcpExecutor = async () => ({ status: 'running' });
    await expect(resolver.resolveTool('fixture', { health })).rejects.toThrow('unhealthy');
  });

  test('no config and unsupported function declarations cannot establish health', async () => {
    expect(await resolver.checkHealth({}, { execute: true })).toBe(false);
    expect((await resolver.inspectHealth({ health_check: { method: 'function', function: 'return true' } }, { execute: true })).status).toBe('unavailable');
    expect((await resolver.inspectHealth({ mcp_specific: { health_check: { method: 'tool_call', command: 'ping' } } })).status).toBe('not_checked');
  });

  test('shipped nested MCP declarations resolve without invoking a host', async () => {
    resolver.resetSearchPaths();
    const tool = await resolver.resolveTool('context7');
    expect(tool._healthStatus).toBe('not_checked');
    expect(tool.mcp_specific.health_check.command).toBe('resolve-library-id');
    const calls = [];
    expect(await resolver.checkHealth(tool, { execute: true, mcpExecutor: async request => {
      calls.push(request.command);
      return true;
    } })).toBe(true);
    expect(calls).toEqual(['resolve-library-id']);
  });

  test('process timeout cancels work rather than leaving delayed filesystem effects', async () => {
    const marker = path.join(root, 'late-effect');
    const tool = command(`setTimeout(()=>require('fs').writeFileSync(${JSON.stringify(marker)}, 'late'), 250)`);
    expect((await resolver.inspectHealth(tool, { execute: true, timeoutMs: 50 })).status).toBe('timeout');
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(fs.existsSync(marker)).toBe(false);
  });

  test('host adapter deadline and caller cancellation receive abort signals', async () => {
    const tool = { health_check: { method: 'tool_call', command: 'ping' } };
    let signal;
    const mcpExecutor = request => { signal = request.signal; return new Promise(() => {}); };
    expect((await resolver.inspectHealth(tool, { execute: true, timeoutMs: 20, mcpExecutor })).status).toBe('timeout');
    expect(signal.aborted).toBe(true);
    const controller = new AbortController();
    const pending = resolver.inspectHealth(tool, { execute: true, mcpExecutor, signal: controller.signal });
    controller.abort();
    expect((await pending).status).toBe('cancelled');
    expect(signal.aborted).toBe(true);
  });

  test('HTTP checks use a real loopback server and fail on status, redirect and timeout', async () => {
    let requests = 0;
    const server = http.createServer((req, res) => {
      requests++;
      if (req.url === '/hang') return;
      res.statusCode = req.url === '/bad' ? 503 : req.url === '/redirect' ? 302 : 200;
      res.end('ok');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    const tool = suffix => ({ health_check: { method: 'http', endpoint: endpoint + suffix } });
    try {
      expect(await resolver.checkHealth(tool('/'))).toBe(false);
      expect(requests).toBe(0);
      expect(await resolver.checkHealth(tool('/'), { execute: true })).toBe(true);
      expect(await resolver.checkHealth(tool('/bad'), { execute: true })).toBe(false);
      expect(await resolver.checkHealth(tool('/redirect'), { execute: true })).toBe(false);
      expect((await resolver.inspectHealth(tool('/hang'), { execute: true, timeoutMs: 30 })).status).toBe('timeout');
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('legacy platform command lists execute only explicitly, without shell evaluation', async () => {
    const script = path.join(root, 'health.js');
    fs.writeFileSync(script, 'process.exit(0)');
    const platform = process.platform === 'win32' ? 'windows' : 'unix';
    const tool = { health_check: { [platform]: [`"${process.execPath}" "${script}"`] } };
    expect(await resolver.checkHealth(tool)).toBe(false);
    expect(await resolver.checkHealth(tool, { execute: true })).toBe(true);
    tool.health_check[platform].push('aexos-missing-health-executable');
    expect(await resolver.checkHealth(tool, { execute: true })).toBe(false);
  });

  test('all fourteen shipped declarations resolve with operational metadata and unique physical paths', async () => {
    resolver.resetSearchPaths();
    const files = resolver.listAvailableTools();
    expect(files).toHaveLength(14);
    expect(new Set(files.map(file => fs.realpathSync(file))).size).toBe(14);
    const tools = await Promise.all(files.map(file => resolver.resolveTool(path.basename(file, '.yaml'))));
    expect(tools.every(tool => tool._healthStatus === 'not_checked')).toBe(true);
    const routing = tools.find(tool => tool.id === 'llm-routing');
    expect(routing).toMatchObject({ type: 'cli', category: 'cli', installation: { method: 'script' } });
    const declaration = yaml.load(fs.readFileSync(files.find(file => file.endsWith('llm-routing.yaml')), 'utf8'));
    for (const field of ['installation', 'capabilities', 'health_check']) expect(routing[field]).toEqual(declaration[field]);
  });

  test('wrapper precedence and same-name definitions survive discovery across distinct roots', async () => {
    const second = path.join(root, 'second');
    fs.mkdirSync(second);
    definition({ health_check: { method: 'command', command: 'wrapped' } });
    const first = path.join(root, 'fixture.yaml');
    const doc = yaml.load(fs.readFileSync(first, 'utf8'));
    doc.health_check = { method: 'command', command: 'sibling' };
    doc.installation = { method: 'manual' };
    fs.writeFileSync(first, yaml.dump(doc));
    fs.copyFileSync(first, path.join(second, 'fixture.yaml'));
    resolver.setSearchPaths([root, path.resolve(root), second]);
    expect(resolver.listAvailableTools()).toHaveLength(2);
    const resolved = await resolver.resolveTool('fixture');
    expect(resolved.health_check.command).toBe('wrapped');
    expect(resolved.installation.method).toBe('manual');
  });
});
