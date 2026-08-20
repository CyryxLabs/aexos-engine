'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  matchingLane,
  observedHost,
} = require('../../../../scripts/native/provision-trust-root-launcher-inputs-host');

const root = path.resolve(__dirname, '..', '..', '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function verifyEvidence(relativePath) {
  const absolute = path.join(root, relativePath);
  const bytes = fs.readFileSync(absolute);
  const sidecar = fs.readFileSync(`${absolute}.sha256`, 'utf8');
  expect(sidecar).toBe(`${crypto.createHash('sha256').update(bytes).digest('hex')}\n`);
  return JSON.parse(bytes.toString('utf8'));
}

describe('B2P1B0P governed lane fail-closed preflight', () => {
  test('admits a host only when every exact RELEASE lane identity matches', () => {
    const host = observedHost();
    const lane = matchingLane(host);
    if (lane) {
      expect(lane.launcherTupleId).toMatch(/-node-v24\.19\.0$/);
    } else {
      expect(lane).toBeNull();
    }
  });

  test('does not admit a semantic label without the exact asserted image and OS', () => {
    expect(matchingLane({
      platform: 'win32', arch: 'x64', nodeVersion: '24.19.0', imageOs: 'win22',
      imageVersion: 'latest', osVersion: '10.0.20348', osRelease: '',
    })).toBeNull();
  });

  test('pins the native Windows restricted-token and known-folder controller', () => {
    const source = read(
      'tests/fixtures/knowledge/atomic-no-replace/trust-root-lane-controller/windows-controller.cpp',
    );
    expect(source).toContain('SHGetKnownFolderPath(FOLDERID_ProgramFiles');
    expect(source).toContain('CreateRestrictedToken(process_token, DISABLE_MAX_PRIVILEGE | LUA_TOKEN');
    expect(source).toContain('SE_GROUP_USE_FOR_DENY_ONLY');
    expect(source).toContain('SetTokenInformation(restricted_token, TokenIntegrityLevel');
    expect(source).toContain('CreateProcessAsUserW(restricted_token');
    expect(source).toContain('OWNER_SECURITY_INFORMATION | GROUP_SECURITY_INFORMATION');
    expect(source).not.toMatch(/node(?:\.exe)?|candidate|javascript|receipt/i);
  });

  test('pins the Unix privilege-drop order and root-authority denials', () => {
    const source = read(
      'tests/fixtures/knowledge/atomic-no-replace/trust-root-lane-controller/unix-controller.c',
    );
    expect(source.indexOf('setgroups(0, NULL)')).toBeLessThan(source.indexOf('setresgid('));
    expect(source.indexOf('setresgid(')).toBeLessThan(source.indexOf('setresuid('));
    expect(source.indexOf('setgroups(0, NULL)')).toBeLessThan(source.indexOf('setgid('));
    expect(source.indexOf('setgid(')).toBeLessThan(source.indexOf('setuid('));
    expect(source).toContain('capability_value("CapEff:") == 0');
    expect(source).toContain('ROOT_WRITE_NOT_DENIED');
    expect(source).toContain('ROOT_DELETE_NOT_DENIED');
    expect(source).toContain('ROOT_ACL_NOT_DENIED');
  });

  test('binds passing exact Windows, Linux and Darwin controller observations', () => {
    const windows = verifyEvidence(
      'artifacts/b2p-launcher-inputs-host-local/remote/b0p-windows-elevated-lane.json',
    );
    const unix = verifyEvidence(
      'artifacts/b2p-launcher-inputs-host-local/remote/b0p-unix-elevated-lanes.json',
    );
    expect(windows.result).toBe('PASS');
    expect(windows.elevatedLane.ready).toBe(true);
    expect(windows.elevatedLane.installerPrincipalId)
      .not.toBe(windows.elevatedLane.runtimePrincipalId);
    expect(unix.result).toBe('PASS');
    expect(unix.jobs.map((job) => job.elevatedLane.ready)).toEqual([true, true]);
    expect(windows.launcherPassEmitted).toBe(false);
    expect(unix.launcherPassEmitted).toBe(false);
  });
});
