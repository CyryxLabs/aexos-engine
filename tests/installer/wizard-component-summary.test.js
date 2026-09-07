'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const wizard = require('../../packages/installer/src/wizard');
const { getInstalledComponentCounts } = wizard._testing;

describe('wizard installed component summary', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-component-summary-'));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('counts component files from the installed destination', () => {
    const developmentRoot = path.join(projectRoot, '.aexos-core', 'development');
    const fixtures = {
      agents: ['aexos-master.md', 'dev.md', 'qa.md'],
      tasks: ['create-story.md', 'develop-story.md'],
      workflows: ['full-sdc.yaml'],
      templates: ['story.md', 'prd.md'],
    };

    for (const [component, files] of Object.entries(fixtures)) {
      const componentDir = path.join(developmentRoot, component);
      fs.mkdirSync(componentDir, { recursive: true });
      for (const file of files) {
        fs.writeFileSync(path.join(componentDir, file), component, 'utf8');
      }
    }

    // Agent memory directories are not agent definitions and must not inflate
    // the same count shown in the init summary.
    fs.mkdirSync(path.join(developmentRoot, 'agents', 'dev'), { recursive: true });
    fs.writeFileSync(
      path.join(developmentRoot, 'agents', 'dev', 'MEMORY.md'),
      '# memory',
      'utf8',
    );

    expect(getInstalledComponentCounts(projectRoot)).toEqual({
      agents: 3,
      tasks: 2,
      workflows: 1,
      templates: 2,
    });
  });

  it('reports zero only when the installed component directory is absent', () => {
    expect(getInstalledComponentCounts(projectRoot)).toEqual({
      agents: 0,
      tasks: 0,
      workflows: 0,
      templates: 0,
    });
  });
});
