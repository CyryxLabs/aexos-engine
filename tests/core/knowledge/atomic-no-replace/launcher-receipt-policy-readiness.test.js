'use strict';

const {
  LAUNCHER_RECEIPT_POLICY,
  validateLauncherReceiptPolicy,
} = require('../../../../scripts/native/provision-trust-root-launcher-inputs-host');

describe('B2P1B0P launcher receipt readiness policy', () => {
  test('pins the downstream 53+3 denominator and negative cell set without emitting a receipt', () => {
    expect(validateLauncherReceiptPolicy()).toBe(true);
    expect(LAUNCHER_RECEIPT_POLICY).toMatchObject({
      schemaVersion: 'aexos.os-rooted-launcher-host-receipt/v1',
      negativeCellSetSha256:
        'b055ce60d9aab131c096f6c26388f85847e8c756987615983eb460238d748326',
      cellDenominator: 53,
      lifecycleDenominator: 3,
    });
    expect(LAUNCHER_RECEIPT_POLICY.lifecycleOrder).toEqual([
      'fresh-install', 'upgrade', 'rollback',
    ]);
    expect(LAUNCHER_RECEIPT_POLICY.lifecycleKeys).toHaveLength(9);
    expect(LAUNCHER_RECEIPT_POLICY.noEgressKeys).toHaveLength(9);
  });
});
