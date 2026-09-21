'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT } = require('../../scripts/parity/lib');
const { RELOCATIONS, GENERATED, mapPath, pathContract } = require('../../scripts/parity/path-contracts');

describe('Reviewed upstream path correspondences', () => {
  test.each(Object.entries(RELOCATIONS))('%s has an exact existing destination', (source, target) => {
    expect(mapPath(source)).toBe(target);
    expect(fs.statSync(path.join(ROOT, target)).isFile()).toBe(true);
    expect(pathContract(source)).toEqual({ kind: 'relocated', paths: [target], entrypoints: [target], outputs: [] });
  });

  test('maps command fragments without applying aliases to unrelated paths', () => {
    expect(mapPath('.aiox-core/development/tasks/squad-creator-sync-synkra.md#sync')).toBe('.aexos-core/development/tasks/squad-creator-sync-aexos.md#sync');
    expect(mapPath('other/README.en.md')).toBe('other/README.en.md');
    expect(mapPath('.aiox-core/core/engine.js')).toBe('.aexos-core/core/engine.js');
  });

  test.each(Object.entries(GENERATED))('%s retains an output obligation and reachable producer', (source, generated) => {
    const mapping = pathContract(source);
    expect(mapping.outputs).toEqual([generated.output]);
    expect(mapping.paths).toEqual([generated.producer]);
    expect(mapping.entrypoints).toEqual([`${generated.producer}#${generated.entrypoint}`]);
    const text = fs.readFileSync(path.join(ROOT, generated.producer), 'utf8');
    expect(text).toContain(generated.entrypoint);
    expect(mapping).not.toHaveProperty('verified');
    expect(mapping).not.toHaveProperty('scope_exception');
  });

  test('does not claim equivalence for superficially similar setup implementations', () => {
    expect(pathContract('.claude/setup/install.sh').kind).toBe('namespace');
    expect(pathContract('.claude/setup/statusline-custom.sh').paths).toEqual(['.claude/setup/statusline-custom.sh']);
  });
});
