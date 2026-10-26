'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
let fixture;
let brand;
const copy = relative => {
  const destination = path.join(fixture, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(ROOT, relative), destination);
};
const editAgent = (name, mutate) => {
  const file = path.join(brand, 'agents', `${name}.md`);
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, text.replace(/```yaml\r?\n([\s\S]*?)\r?\n```/, (_, block) => {
    const agent = yaml.load(block);
    mutate(agent);
    return '```yaml\n' + yaml.dump(agent, { lineWidth: -1 }) + '```';
  }));
};
const cli = () => {
  const result = spawnSync(process.execPath, [path.join(fixture, 'scripts/validate-squads.js')], {
    cwd: fixture, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') },
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
};
const rejected = target => {
  const result = cli();
  expect(result.status).toBe(1);
  expect(result.output).toContain('COMMAND_DEPENDENCY_INVALID');
  expect(result.output).toContain(target);
  expect(result.output).not.toContain('RangeError');
};

beforeAll(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'aex-brand-commands-'));
  brand = path.join(fixture, 'squads/brand');
  [
    'scripts/validate-squads.js', 'scripts/lib/validate-brand-policy.js',
    'scripts/lib/validate-command-dependencies.js',
    '.aexos-core/development/scripts/squad/squad-validator.js',
    '.aexos-core/development/scripts/workflow-validator.js',
    '.aexos-core/schemas/squad-schema.json',
  ].forEach(copy);
});
beforeEach(() => {
  fs.rmSync(brand, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'squads/brand'), brand, { recursive: true });
});
afterAll(() => { if (fixture) fs.rmSync(fixture, { recursive: true, force: true }); });

test('actual Brand command paths and selected sections pass the actual CLI', () => {
  expect(cli()).toEqual({ status: 0, output: expect.stringContaining('0 error(s), 0 warning(s)') });
});
test('nested array dependency must exist', () => {
  editAgent('sagi-haviv', agent => { agent.commands[0].dependencies = ['tasks/absent-nested.md']; });
  rejected('commands[0].dependencies (*logo-brief)[0]');
});
test('singular command dependency must exist', () => {
  editAgent('emily-heyward', agent => { agent.commands[0].dependency = 'tasks/absent-singular.md'; });
  rejected('commands[0].dependency (*obsessed)');
});
test('nested Alexandra operations command dependency must exist', () => {
  editAgent('alexandra-watkins', agent => {
    agent['level-6-operations'].commands.creative_brief.dependency = 'tasks/absent-operation.md';
  });
  rejected('level-6-operations.commands.creative_brief.dependency (*creative-brief)');
});
test('loader requires target must exist', () => {
  editAgent('brand-chief', agent => {
    agent.command_loader['*brand-from-zero'].requires.push('tasks/absent-loader.md');
  });
  rejected('command_loader.*brand-from-zero.requires');
});
test('advertised loader target must exist', () => {
  editAgent('brand-chief', agent => { agent.commands[0].loader = 'tasks/absent-advertised.md'; });
  rejected('commands[0].loader');
});
test('removing a real nested dependency target fails', () => {
  fs.unlinkSync(path.join(brand, 'tasks/logo-design.md'));
  rejected('tasks/logo-design.md');
});
test('removing a real singular target fails', () => {
  fs.unlinkSync(path.join(brand, 'tasks/movement-architecture.md'));
  rejected('dependency (*obsessed)');
});
test('removing a real loader target fails', () => {
  fs.unlinkSync(path.join(brand, 'workflows/wf-brand-from-zero.yaml'));
  rejected('command_loader.*brand-from-zero.requires');
});
test.each([
  '*probe → Read("squads/brand/tasks/missing-direct.md")',
  '*probe ->\n  Read(\n    "squads/brand/tasks/missing-direct.md"\n  )',
])('missing direct-Read target fails: %s', instruction => {
  editAgent('alexandra-watkins', agent => { agent['IDE-FILE-RESOLUTION'] += '\n' + instruction; });
  rejected('direct-Read *probe');
});
test('removing a real direct-Read target fails', () => {
  fs.unlinkSync(path.join(brand, 'tasks/naming-exercise.md'));
  rejected('direct-Read *creative-brief');
});
test.each(['*probe -> Read(unquoted.md)', '*probe -> Read("tasks/logo-evaluation.md"'])('malformed direct load fails: %s', instruction => {
  editAgent('alexandra-watkins', agent => { agent['IDE-FILE-RESOLUTION'] += '\n' + instruction; });
  rejected('expected exactly one quoted file reference');
});
test('existing directory is not a file dependency', () => {
  fs.mkdirSync(path.join(brand, 'tasks/folder.md'));
  editAgent('emily-heyward', agent => { agent.commands[0].dependency = 'tasks/folder.md'; });
  rejected('not a regular file');
});
test('missing bounded section fails even when file exists', () => {
  editAgent('sagi-haviv', agent => { agent.commands[0].dependencies = ['tasks/logo-evaluation.md#absent-section']; });
  rejected('required section #absent-section');
});

test('a section anchor cannot be passed as a filesystem Read path', () => {
  editAgent('alexandra-watkins', agent => {
    agent['IDE-FILE-RESOLUTION'] += '\n*probe -> Read("squads/brand/tasks/naming-exercise.md#creative-brief")';
  });
  rejected('Read must receive the base filename');
});

test.each(['```markdown', '~~~~yaml'])('a heading inside a fenced example does not satisfy a procedure: %s', opening => {
  const file = path.join(brand, 'tasks/logo-evaluation.md');
  const closing = opening.startsWith('`') ? '```' : '~~~~';
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## simplicity-test', '## removed-procedure') +
    '\n' + opening + '\n## simplicity-test\n' + closing + '\n');
  rejected('required section #simplicity-test not found');
});

test('duplicate procedure headings fail as ambiguous', () => {
  fs.appendFileSync(path.join(brand, 'tasks/logo-evaluation.md'), '\n## simplicity-test\nDifferent procedure.\n');
  rejected('required section #simplicity-test is ambiguous');
});
test('non-file prerequisites, symbolic ids and ordinary examples are not files', () => {
  editAgent('alexandra-watkins', agent => {
    agent['level-6-operations'].commands.creative_brief.requires = ['BR-TP-001', 'git', 'Brand name and positioning defined'];
    agent['IDE-FILE-RESOLUTION'] += '\nExample only: Read("tasks/nonexistent-example.md")';
  });
  expect(cli().status).toBe(0);
});
test('grouped dependencies and aliases are validated without false failures', () => {
  editAgent('sagi-haviv', agent => {
    const shared = { tasks: ['logo-evaluation.md'], tools: ['git', 'BR-TP-001'] };
    agent.commands[0].dependencies = shared;
    agent.commands[1].dependencies = shared;
  });
  expect(cli().status).toBe(0);
});
test.each([false, [42], { tasks: false }])('malformed required dependency fails: %j', dependency => {
  editAgent('emily-heyward', agent => { agent.commands[0].dependency = dependency; });
  rejected('dependency (*obsessed)');
});
test('cyclic command aliases fail with a bounded diagnostic', () => {
  editAgent('emily-heyward', agent => { agent.commands[0].loop = agent.commands[0]; });
  rejected('cyclic command definition');
});
