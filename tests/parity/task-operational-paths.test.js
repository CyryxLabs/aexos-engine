const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const tasksRoot = path.join(root, '.aexos-core/development/tasks');
const baseline = require('./fixtures/task-contract-baseline.json');

const relocatedPaths = [
  '.aexos-core/infrastructure/scripts/component-generator.js',
  '.aexos-core/infrastructure/scripts/test-utilities.js',
  '.aexos-core/development/scripts/backlog-manager.js',
  '.aexos-core/infrastructure/scripts/project-status-loader.js',
  '.aexos-core/infrastructure/scripts/pm-adapter-factory.js',
  '.aexos-core/development/scripts/story-manager.js',
  '.aexos-core/development/scripts/story-index-generator.js',
  '.aexos-core/infrastructure/scripts/documentation-synchronizer.js',
  '.aexos-core/infrastructure/scripts/capability-analyzer.js',
  '.aexos-core/infrastructure/scripts/improvement-validator.js',
  '.aexos-core/infrastructure/scripts/sandbox-tester.js',
  '.aexos-core/development/scripts/decision-recorder.js',
  '.aexos-core/infrastructure/scripts/aexos-validator.js',
  '.aexos-core/data/technical-preferences.md',
  '.aexos-core/core/code-intel/helpers/story-helper.js',
  '.aexos-core/core/code-intel/helpers/planning-helper.js',
  '.aexos-core/core/code-intel/helpers/devops-helper.js',
  '.aexos-core/core/code-intel/helpers/dev-helper.js',
  '.aexos-core/core/orchestration/executor-assignment.js',
  '.aexos-core/core/config/config-resolver.js',
  '.aexos-core/core/ids/registry-healer.js',
  '.aexos-core/core/ids/registry-loader.js',
  '.aexos-core/core/ids/incremental-decision-engine.js',
  '.aexos-core/core/code-intel/registry-syncer.js',
  '.aexos-core/infrastructure/scripts/gotchas-documenter.js',
  '.aexos-core/infrastructure/scripts/documentation-integrity/brownfield-analyzer.js',
  '.aexos-core/infrastructure/scripts/pattern-extractor.js',
  '.aexos-core/workflow-intelligence/engine/suggestion-engine.js',
  '.aexos-core/workflow-intelligence/engine/output-formatter.js',
  '.aexos-core/development/scripts/workflow-state-manager.js',
  '.aexos-core/core/elicitation/session-manager.js',
  '.aexos-core/infrastructure/scripts/backup-manager.js',
  '.aexos-core/development/templates/squad/workflow-template.yaml',
  '.aexos-core/development/checklists',
  '.aexos-core/product/checklists',
];

const legacyAdvertisedPaths = [
  '.aexos-core/scripts/component-generator.js',
  '.aexos-core/scripts/project-status-loader.js',
  '.aexos-core/scripts/pm-adapter-factory',
  '.aexos-core/scripts/story-manager',
  '.aexos-core/scripts/story-index-generator',
  '.aexos-core/development/data/technical-preferences.md',
  '.aexos-core/development/templates/squad/workflow-template.md',
];

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function taskFiles(directory = tasksRoot) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return taskFiles(absolute);
    return entry.name.endsWith('.md') ? [absolute] : [];
  });
}

function substantiveProjection(source) {
  const output = [];
  let skipDependencyMetadata = false;

  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.*)/);
    if (heading && heading[1].length <= 2) {
      skipDependencyMetadata = /^(Tools|Scripts)(\s|$|\()/i.test(heading[2]);
      if (skipDependencyMetadata) continue;
    }
    if (skipDependencyMetadata) continue;

    output.push(
      line
        .replace(
          /(?:\.\/|\.\.\/)*\.a(?:iox|exos)-core\/[A-Za-z0-9_./{}-]+/g,
          '<LOCAL_PATH>',
        )
        .replace(
          /require\(require\('path'\)\.resolve\(process\.cwd\(\), '(<LOCAL_PATH>)'\)\)/g,
          "require('$1')",
        )
        .replace(/AIOX/gi, 'FRAMEWORK')
        .replace(/AEXOS/gi, 'FRAMEWORK')
        .replace(/Synkra/gi, 'VENDOR')
        .replace(/Cyryx/gi, 'VENDOR')
        .replace(/Quinn/g, 'QA_REVIEWER')
        .replace(/Argus/g, 'QA_REVIEWER')
        .replace(/neo4j-driver/gi, 'DATABASE_CLIENT')
        .replace(/Neo4j/gi, 'DATABASE')
        .replace(/PostgreSQL/gi, 'DATABASE')
        .replace(/Cypher/gi, 'QUERY')
        .replace(/SQL/g, 'QUERY')
        .replace(/[ \t]+$/, ''),
    );
  }

  return output.join('\n').trim();
}

describe('task operational dependency contracts', () => {
  const currentTaskFiles = taskFiles();
  const allTaskText = taskFiles()
    .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    .join('\n');

  test('the portable immutable baseline covers every mapped task and extension', () => {
    expect(baseline.upstream_commit).toBe('4ef6530ff03b83aea953e4a426f95e012b8b70c5');
    expect(baseline.record_count).toBe(baseline.expected.mapped_task_count);
    expect(currentTaskFiles).toHaveLength(baseline.expected.candidate_task_count);
    for (const record of baseline.records) {
      expect(fs.statSync(path.join(root, record.path)).isFile()).toBe(true);
    }
    const mapped = new Set(baseline.records.map(({ path: taskPath }) => taskPath));
    const extensions = currentTaskFiles
      .map((filePath) => path.relative(tasksRoot, filePath).replace(/\\/g, '/'))
      .filter((relative) => !mapped.has(`.aexos-core/development/tasks/${relative}`));
    expect(extensions).toEqual(baseline.expected.candidate_extensions);
  });

  test('verified relocated dependencies exist and stale advertised paths are gone', () => {
    for (const dependency of relocatedPaths) {
      expect(fs.existsSync(path.join(root, dependency))).toBe(true);
    }
    for (const stalePath of legacyAdvertisedPaths) {
      expect(allTaskText).not.toContain(stalePath);
    }
    expect(allTaskText).not.toContain('.js.js');
  });

  test('corrected imports match the modules public interfaces', () => {
    const ComponentGenerator = require('../../.aexos-core/infrastructure/scripts/component-generator');
    const { BacklogManager } = require('../../.aexos-core/development/scripts/backlog-manager');
    const statusLoader = require('../../.aexos-core/infrastructure/scripts/project-status-loader');
    const pmAdapter = require('../../.aexos-core/infrastructure/scripts/pm-adapter-factory');
    const storyManager = require('../../.aexos-core/development/scripts/story-manager');
    const { SuggestionEngine } = require('../../.aexos-core/workflow-intelligence/engine/suggestion-engine');

    expect(ComponentGenerator).toEqual(expect.any(Function));
    expect(BacklogManager).toEqual(expect.any(Function));
    expect(statusLoader.loadProjectStatus).toEqual(expect.any(Function));
    expect(pmAdapter.getPMAdapter).toEqual(expect.any(Function));
    expect(storyManager.syncStoryToPM).toEqual(expect.any(Function));
    expect(SuggestionEngine).toEqual(expect.any(Function));
    expect(fs.readFileSync(path.join(tasksRoot, 'next.md'), 'utf8')).toContain(
      'const { SuggestionEngine } = require(',
    );
    expect(allTaskText).not.toMatch(/require\(['"]\.aexos-core\//);
  });

  test('the real next recommendation path de-duplicates runtime-first output', async () => {
    const { SuggestionEngine } = require('../../.aexos-core/workflow-intelligence/engine/suggestion-engine');
    const { WorkflowStateManager } = require('../../.aexos-core/development/scripts/workflow-state-manager');
    const context = {
      agentId: 'dev',
      lastCommands: [],
      projectState: {
        storyStatus: 'blocked',
        qaStatus: 'unknown',
        ciStatus: 'unknown',
        hasUncommittedChanges: false,
      },
    };
    const result = await new SuggestionEngine({ useLearnedPatterns: false }).suggestNext(context);
    const runtimeNext = new WorkflowStateManager().getNextActionRecommendation(
      {
        story_status: 'blocked',
        qa_status: 'unknown',
        ci_status: 'unknown',
        has_uncommitted_changes: false,
      },
      { story: '' },
    );
    expect(runtimeNext.command).toBe('*orchestrate-status');
    expect(result.suggestions[0].command).toBe(runtimeNext.command);

    const nextTask = fs.readFileSync(path.join(tasksRoot, 'next.md'), 'utf8');
    const stepFive = nextTask.match(
      /### Step 5: Format Output\s+```javascript\s+([\s\S]*?)\s+```/,
    );
    expect(stepFive).toBeTruthy();
    const output = [];
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation((value) => output.push(value));
    try {
      vm.runInNewContext(stepFive[1], {
        args: { all: true },
        path,
        projectRoot: root,
        require,
        result,
        runtimeNext,
      });
    } finally {
      consoleSpy.mockRestore();
    }
    const rendered = output.join('\n');
    expect(rendered.match(/\*orchestrate-status/g)).toHaveLength(1);
  });

  test('unshipped inherited wrappers are explicit prerequisites, not runnable claims', () => {
    for (const [dependency, occurrences] of Object.entries(
      baseline.expected.unsupported_occurrences,
    )) {
      expect(fs.existsSync(path.join(root, dependency))).toBe(false);
      expect(allTaskText.split(dependency)).toHaveLength(occurrences + 1);
    }
  });

  test('immutable baseline retains modes, contracts, and unreviewed substantive bodies', () => {
    expect(baseline.record_count).toBe(218);
    for (const record of baseline.records) {
      const text = fs.readFileSync(path.join(root, record.path), 'utf8');
      for (const heading of [...record.mode_headings, ...record.contract_headings]) {
        expect(text).toContain(heading);
      }
      if (!record.reviewed_body_correction) {
        expect(sha256Text(substantiveProjection(text))).toBe(
          record.substantive_projection_sha256,
        );
      }
    }

    const contextBlock = fs.readFileSync(
      path.join(tasksRoot, 'blocks/context-loading.md'),
      'utf8',
    );
    expect(contextBlock).toContain('loadContextFromHost');
    expect(contextBlock).toContain('| File not found | Log warning, continue with empty value |');
    expect(contextBlock).not.toContain('const context = await loadContext(');

    const cleanup = fs.readFileSync(path.join(tasksRoot, 'cleanup-utilities.md'), 'utf8');
    expect(cleanup).toContain('ARCHIVE-MANIFEST.tsv');
    expect(cleanup).toContain('relative="${source#.aexos-core/}"');
    expect(cleanup).not.toContain('rm -rf .aexos-core/utils');

    const databaseTasks = taskFiles().filter((filePath) => /^db-.*\.md$/.test(path.basename(filePath)));
    expect(databaseTasks).toHaveLength(20);
    for (const filePath of databaseTasks) {
      const text = fs.readFileSync(filePath, 'utf8');
      expect(text).toContain('configured PostgreSQL/Supabase tooling');
      expect(text).not.toMatch(/neo4j|cypher/i);
    }
  });
});
