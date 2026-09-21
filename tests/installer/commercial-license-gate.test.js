'use strict';

const {
  CommercialLicenseRequiredError,
  INSTALL_MODES,
  enforceCommercialInstallGate,
  loadCommercialConfig,
  resolveCredentialOptions,
} = require('../../packages/installer/src/licensing/commercial-license-gate');

describe('commercial install license gate', () => {
  test('preserves historical package behavior in legacy mode', async () => {
    const runLicenseWizard = jest.fn();

    const result = await enforceCommercialInstallGate({
      config: { installMode: INSTALL_MODES.LEGACY },
      runLicenseWizard,
    });

    expect(result).toEqual({
      required: false,
      admitted: true,
      mode: INSTALL_MODES.LEGACY,
    });
    expect(runLicenseWizard).not.toHaveBeenCalled();
  });

  test('admits an enforced candidate only after successful validation', async () => {
    const runLicenseWizard = jest.fn().mockResolvedValue({
      success: true,
      licenseValidated: true,
      scaffolded: true,
    });

    const result = await enforceCommercialInstallGate({
      targetDir: process.cwd(),
      licenseKey: 'AEXOS-TEST-KEY',
      config: {
        installMode: INSTALL_MODES.ENFORCE,
        purchaseUrl: 'https://example.test/buy',
        supportUrl: 'https://example.test/support',
      },
      runLicenseWizard,
      env: {},
      quiet: true,
    });

    expect(result.required).toBe(true);
    expect(result.admitted).toBe(true);
    expect(runLicenseWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'AEXOS-TEST-KEY',
        quiet: true,
      }),
    );
  });

  test('fails closed with a typed error and redacts credentials', async () => {
    const licenseKey = 'AEXOS-SECRET-LICENSE';
    const runLicenseWizard = jest.fn().mockResolvedValue({
      success: false,
      licenseValidated: false,
      error: `Server rejected ${licenseKey}`,
    });

    await expect(
      enforceCommercialInstallGate({
        licenseKey,
        config: {
          installMode: INSTALL_MODES.ENFORCE,
          purchaseUrl: 'https://example.test/buy',
          supportUrl: 'https://example.test/support',
        },
        runLicenseWizard,
        env: {},
      }),
    ).rejects.toMatchObject({
      name: 'CommercialLicenseRequiredError',
      code: 'AEXOS_LICENSE_REQUIRED',
      recoverable: true,
    });

    try {
      await enforceCommercialInstallGate({
        licenseKey,
        config: {
          installMode: INSTALL_MODES.ENFORCE,
          purchaseUrl: 'https://example.test/buy',
          supportUrl: 'https://example.test/support',
        },
        runLicenseWizard,
        env: {},
      });
    } catch (error) {
      expect(error).toBeInstanceOf(CommercialLicenseRequiredError);
      expect(error.message).not.toContain(licenseKey);
      expect(error.message).toContain('[REDACTED]');
      expect(error.message).toContain('https://example.test/buy');
    }
  });

  test('supports canonical and legacy credential environment names', () => {
    expect(
      resolveCredentialOptions(
        {},
        {
          AEXOS_LICENSE_KEY: 'canonical-key',
          AEXOS_PRO_KEY: 'legacy-key',
          AEXOS_LICENSE_EMAIL: 'buyer@example.test',
          AEXOS_LICENSE_PASSWORD: 'secret',
        },
      ),
    ).toEqual({
      key: 'canonical-key',
      email: 'buyer@example.test',
      password: 'secret',
    });
  });

  test('reads the checked-in package as historical legacy mode', () => {
    expect(loadCommercialConfig().installMode).toBe(INSTALL_MODES.LEGACY);
  });
});
