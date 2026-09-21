'use strict';
const { summarizeDrift } = require('../../scripts/parity/lib');

test('upstream contract changes reopen transitive consumers and inventory new files', () => {
  const before = [{ path: 'package.json', oid: 'old', mode: '100644' }, { path: 'core.js', oid: 'same', mode: '100644' }];
  const after = [{ path: 'package.json', oid: 'new', mode: '100644' }, { path: 'core.js', oid: 'same', mode: '100755' }, { path: 'new-hook.js', oid: 'hook', mode: '100644' }];
  const previous = new Map([['old', Buffer.from(JSON.stringify({ dependencies: { tar: '1' }, scripts: { check: 'old.js' } }))]]);
  const next = new Map([['new', Buffer.from(JSON.stringify({ dependencies: { tar: '2' }, scripts: { check: 'new.js' } }))]]);
  const caps = [
    { id: 'direct', upstream: { paths: ['core.js'] } },
    { id: 'caller', upstream: { paths: ['entry.js'] } },
    { id: 'unaffected', upstream: { paths: ['other.js'] } },
  ];
  const edges = [{ source: 'entry.js', destination: 'middle.js' }, { source: 'middle.js', destination: 'core.js' }];
  const report = summarizeDrift(before, after, previous, next, caps, edges);
  expect(report.changes).toHaveLength(3);
  expect(report.contract_changes.map(change => change.contract)).toEqual(['scripts', 'dependencies']);
  expect(report.reopen_capability_ids).toEqual(['direct', 'caller']);
  expect(report.newly_discovered_paths_requiring_inventory).toEqual(['new-hook.js']);
});

test('unchanged upstream does not fabricate drift', () => {
  const entries = [{ path: 'file.js', oid: 'same', mode: '100644' }];
  expect(summarizeDrift(entries, entries, new Map(), new Map()).changes).toEqual([]);
});
