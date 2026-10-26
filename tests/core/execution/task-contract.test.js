'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  TaskContractError,
  loadTaskContract,
  assertProducedPaths,
  validateTaskCorpus,
} = require('../../../.aexos-core/core/execution/task-contract');

describe('task contract', () => {
  let projectRoot;
  let taskRoot;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-task-contract-'));
    taskRoot = path.join(projectRoot, '.aexos-core', 'development', 'tasks');
    fs.mkdirSync(taskRoot, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  function writeTask(name, content) {
    const taskPath = path.join(taskRoot, name);
    fs.writeFileSync(taskPath, content, 'utf8');
    return taskPath;
  }

  const validTask = [
    '---',
    'contractVersion: 1',
    'inputs:',
    '  - name: story',
    '    type: path',
    '    required: true',
    'produces:',
    '  - name: story_file',
    '    kind: story',
    '    path: docs/stories/{story}.md',
    'verify:',
    '  - type: file-exists',
    '    target: docs/stories/{story}.md',
    '---',
    '# Task body remains prose',
  ].join('\n');

  it('loads and validates a complete contract', () => {
    const taskPath = writeTask('valid.md', validTask);
    const result = loadTaskContract(taskPath, { projectRoot, enforcement: 'strict' });

    expect(result.status).toBe('contracted');
    expect(result.valid).toBe(true);
    expect(result.parallelSafe).toBe(true);
    expect(result.contract.produces[0].path).toBe('docs/stories/{story}.md');
  });

  it('marks a legacy task unsafe in warn mode and rejects it in strict mode', () => {
    const taskPath = writeTask('legacy.md', '# Legacy task\n');
    const warning = loadTaskContract(taskPath, { projectRoot, enforcement: 'warn' });
    const strict = loadTaskContract(taskPath, { projectRoot, enforcement: 'strict' });

    expect(warning).toMatchObject({ status: 'uncontracted', valid: true, parallelSafe: false });
    expect(strict).toMatchObject({ status: 'uncontracted', valid: false, parallelSafe: false });
    expect(strict.errors[0].code).toBe('TASK_CONTRACT_REQUIRED');
  });

  it('treats a partial contract as invalid instead of legacy', () => {
    const taskPath = writeTask('partial.md', [
      '---',
      'contractVersion: 1',
      'inputs: []',
      '---',
      '# Partial',
    ].join('\n'));

    const result = loadTaskContract(taskPath, { projectRoot, enforcement: 'warn' });
    expect(result.status).toBe('invalid');
    expect(result.valid).toBe(false);
  });

  it('rejects declared traversal and absolute output paths', () => {
    const traversal = validTask.replace(
      'docs/stories/{story}.md',
      '../../outside/{story}.md',
    );
    const absolute = validTask.replace(
      'docs/stories/{story}.md',
      'C:\\outside\\{story}.md',
    );

    expect(loadTaskContract(writeTask('traversal.md', traversal), {
      projectRoot,
    }).errors[0].code).toBe('TASK_OUTPUT_PATH_TRAVERSAL');
    expect(loadTaskContract(writeTask('absolute.md', absolute), {
      projectRoot,
    }).errors[0].code).toBe('TASK_OUTPUT_ABSOLUTE_PATH');
  });

  it('accepts declared template outputs and rejects undeclared or escaping outputs', () => {
    const taskPath = writeTask('valid.md', validTask);
    const { contract } = loadTaskContract(taskPath, { projectRoot, enforcement: 'strict' });

    expect(assertProducedPaths(contract, ['docs/stories/AEX-1.1.md'], projectRoot))
      .toEqual(['docs/stories/AEX-1.1.md']);
    expect(() => assertProducedPaths(contract, ['README.md'], projectRoot))
      .toThrow(expect.objectContaining({ code: 'TASK_OUTPUT_UNDECLARED' }));
    expect(() => assertProducedPaths(contract, ['../../outside.md'], projectRoot))
      .toThrow(expect.objectContaining({ code: 'TASK_OUTPUT_PATH_TRAVERSAL' }));
  });

  it('reports deterministic corpus coverage', () => {
    writeTask('valid.md', validTask);
    writeTask('legacy.md', '# Legacy task\n');

    const warning = validateTaskCorpus({ projectRoot, taskRoot, enforcement: 'warn' });
    const strict = validateTaskCorpus({ projectRoot, taskRoot, enforcement: 'strict' });

    expect(warning).toMatchObject({
      total: 2,
      contracted: 1,
      uncontracted: 1,
      invalid: 0,
      coverage: 50,
      valid: true,
    });
    expect(strict.valid).toBe(false);
  });

  it('rejects unsupported enforcement modes', () => {
    const taskPath = writeTask('valid.md', validTask);
    expect(() => loadTaskContract(taskPath, { projectRoot, enforcement: 'off' }))
      .toThrow(TaskContractError);
  });

  it('exposes a deterministic JSON CLI report and strict exit code', () => {
    writeTask('valid.md', validTask);
    writeTask('legacy.md', '# Legacy task\n');
    const script = path.resolve(__dirname, '../../../scripts/validate-task-contracts.js');
    const args = [
      script,
      `--project-root=${projectRoot}`,
      `--task-root=${taskRoot}`,
      '--enforcement=strict',
      '--json',
    ];
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(report).toMatchObject({
      total: 2,
      contracted: 1,
      uncontracted: 1,
      invalid: 0,
      coverage: 50,
      valid: false,
    });
  });
});
