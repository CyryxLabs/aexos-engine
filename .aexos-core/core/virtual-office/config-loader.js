'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'virtual-office.config.yaml');

function readYamlConfig(configPath = DEFAULT_CONFIG_PATH) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Virtual Office configuration not found: ${configPath}`);
  }

  const parsed = yaml.load(fs.readFileSync(configPath, 'utf8')) || {};
  return parsed.virtual_office || {};
}

function integerInRange(value, label, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function loadConfig(overrides = {}, configPath = DEFAULT_CONFIG_PATH) {
  const defaults = readYamlConfig(configPath);
  const host = overrides.host || defaults.host;

  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error('Virtual Office only accepts loopback hosts: 127.0.0.1, localhost, or ::1');
  }

  const config = {
    host,
    port: integerInRange(overrides.port ?? defaults.port, 'port', 1, 65535),
    openBrowser: overrides.openBrowser ?? defaults.open_browser,
    heartbeatTtlMs: integerInRange(
      overrides.heartbeatTtlMs ?? defaults.heartbeat_ttl_ms,
      'heartbeat_ttl_ms',
      1000,
      3600000,
    ),
    recentCompletionMs: integerInRange(
      overrides.recentCompletionMs ?? defaults.recent_completion_ms,
      'recent_completion_ms',
      1000,
      3600000,
    ),
    eventHistoryLimit: integerInRange(
      overrides.eventHistoryLimit ?? defaults.event_history_limit,
      'event_history_limit',
      10,
      5000,
    ),
    maxEventBytes: integerInRange(
      overrides.maxEventBytes ?? defaults.max_event_bytes,
      'max_event_bytes',
      1024,
      1048576,
    ),
    pollingIntervalMs: integerInRange(
      overrides.pollingIntervalMs ?? defaults.polling_interval_ms,
      'polling_interval_ms',
      250,
      60000,
    ),
    logoAsset: defaults.brand?.logo_asset || 'public/assets/cyryx-labs-logo.png',
  };

  return Object.freeze(config);
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  LOOPBACK_HOSTS,
  loadConfig,
  readYamlConfig,
};

