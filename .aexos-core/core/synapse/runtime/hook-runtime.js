'use strict';

const path = require('path');
const fs = require('fs');

// Manifest parsing is a pure function of file content, so it is required from
// this package rather than from `cwd` (unlike session-manager/engine, which are
// resolved project-side). The manifest *data* still comes from `cwd/.synapse`.
const { parseManifest } = require('../domain/domain-loader');
const { resolveSynapsePath } = require('../utils/paths');

const DEFAULT_STALE_TTL_HOURS = 168; // 7 days
const ACTIVE_AGENT_BRIDGE_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Read .aexos-core/core-config.yaml from the current project.
 *
 * @param {string} cwd - Working directory
 * @returns {object} Parsed config object, or empty object on missing/invalid config
 */
function loadCoreConfig(cwd) {
  try {
    if (fs.existsSync(path.join(cwd, '.aexos-core', 'framework-config.yaml'))) {
      return require('../../config/config-resolver').resolveConfig(cwd, { skipCache: true }).config;
    }
    const yaml = require('js-yaml');
    const configPath = path.join(cwd, '.aexos-core', 'core-config.yaml');
    if (!fs.existsSync(configPath)) return {};
    const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
    return config && typeof config === 'object' ? config : {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[synapse:hook-runtime] Failed to load core-config.yaml: ${msg}`);
    return {};
  }
}

/** Hydrate the shared activation bridge without replacing a newer session choice. */
function applyActiveAgentBridge(session, sessionsDir) {
  try {
    const bridgePath = path.join(sessionsDir, '_active-agent.json');
    const mtime = fs.statSync(bridgePath).mtimeMs;
    const bridge = JSON.parse(fs.readFileSync(bridgePath, 'utf8'));
    if (!bridge || typeof bridge.id !== 'string' || !/^[a-z][a-z0-9-]{0,127}$/.test(bridge.id)) return;
    const activatedAt = bridge.activated_at ? Date.parse(bridge.activated_at) : mtime;
    const now = Date.now();
    if (!Number.isFinite(activatedAt) || now - mtime < 0 || now - mtime > ACTIVE_AGENT_BRIDGE_TTL_MS
      || now - activatedAt < 0 || now - activatedAt > ACTIVE_AGENT_BRIDGE_TTL_MS) return;
    const current = session.active_agent;
    // An explicit identity with no comparable timestamp remains authoritative.
    if (current?.id && (!current.activated_at || !Number.isFinite(Date.parse(current.activated_at))
      || Date.parse(current.activated_at) >= activatedAt)) return;
    session.active_agent = {
      id: bridge.id,
      activated_at: new Date(activatedAt).toISOString(),
      activation_quality: ['full', 'partial', 'fallback', 'explicit'].includes(bridge.activation_quality)
        ? bridge.activation_quality : 'explicit',
    };
  } catch (_) { /* Missing, stale or malformed bridge must not disrupt prompt context. */ }
}

/**
 * Read stale session TTL from core-config.yaml.
 * Falls back to DEFAULT_STALE_TTL_HOURS (168h = 7 days).
 *
 * @param {string} cwd - Working directory
 * @returns {number} TTL in hours
 */
function getStaleSessionTTL(cwd) {
  const config = loadCoreConfig(cwd);
  const ttl = config && config.synapse && config.synapse.session && config.synapse.session.staleTTLHours;
  return typeof ttl === 'number' && ttl > 0 ? ttl : DEFAULT_STALE_TTL_HOURS;
}

/**
 * Select one complete SYNAPSE runtime distribution.
 *
 * A project-local runtime takes precedence when its SYNAPSE directory exists.
 * Otherwise, use the modules adjacent to this file (the installed package
 * layout). Selecting the base once prevents mixing engine and session modules
 * from different versions when a project-local runtime is incomplete.
 *
 * @param {string} cwd - Working directory
 * @returns {string} Absolute path to core/synapse
 */
function resolveRuntimeBase(cwd) {
  const projectRuntimeBase = path.join(cwd, '.aexos-core', 'core', 'synapse');
  return fs.existsSync(projectRuntimeBase)
    ? projectRuntimeBase
    : path.resolve(__dirname, '..');
}

/**
 * Resolve runtime dependencies for Synapse hook execution.
 *
 * On the first prompt of a session (prompt_count === 0), runs
 * cleanStaleSessions() fire-and-forget to remove expired sessions.
 *
 * @param {{cwd?: string, session_id?: string, sessionId?: string}} input
 * @returns {{
 *   engine: import('../engine').SynapseEngine,
 *   session: Object
 * } | null}
 */
function resolveHookRuntime(input) {
  const cwd = input && input.cwd;
  const sessionId = input && (input.session_id || input.sessionId);
  if (!cwd || typeof cwd !== 'string') return null;

  const { exists, synapsePath, manifestPath } = resolveSynapsePath(cwd);
  if (!exists) return null;

  try {
    const runtimeBase = resolveRuntimeBase(cwd);
    const {
      loadSession,
      createSession,
      updateSession,
      cleanStaleSessions,
    } = require(path.join(runtimeBase, 'session', 'session-manager.js'));
    const { SynapseEngine } = require(path.join(runtimeBase, 'engine.js'));

    const sessionsDir = path.join(synapsePath, 'sessions');

    // Create session file on first prompt if it doesn't exist.
    // Without this, updateSession() silently fails because loadSession() returns null.
    let session = loadSession(sessionId, sessionsDir);
    if (!session && sessionId) {
      session = createSession(sessionId, cwd, sessionsDir);
    }
    if (!session) {
      session = { prompt_count: 0 };
    }
    applyActiveAgentBridge(session, sessionsDir);
    const coreConfig = loadCoreConfig(cwd);

    // The manifest is SYNAPSE's domain routing table (KEY=VALUE, not YAML).
    // Without it, engine.js resolves `manifest: {}` and every manifest-driven
    // layer degrades: L2 cannot match AGENT_TRIGGER and always returns null.
    // parseManifest() degrades gracefully to empty domains on a missing file.
    const manifest = parseManifest(manifestPath);

    const engine = new SynapseEngine(synapsePath, {
      synapse: coreConfig.synapse || {},
      manifest,
    });

    // AC3: Run cleanup on first prompt only (fire-and-forget)
    if (session.prompt_count === 0) {
      try {
        const ttlHours = getStaleSessionTTL(cwd);
        const removed = cleanStaleSessions(sessionsDir, ttlHours);
        if (removed > 0 && process.env.DEBUG === '1') {
          console.error(`[hook-runtime] Cleaned ${removed} stale session(s) (TTL: ${ttlHours}h)`);
        }
      } catch (_cleanupErr) {
        // Fire-and-forget: never block hook execution
      }
    }

    return { engine, session, sessionId, sessionsDir, cwd, updateSession };
  } catch (error) {
    if (process.env.DEBUG === '1') {
      console.error(`[hook-runtime] Failed to resolve runtime: ${error.message}`);
    }
    return null;
  }
}

/**
 * Normalize hook output payload shape.
 *
 * Claude Code 2.1.68+ validates hook outputs by event-specific schema.
 * For UserPromptSubmit, hookSpecificOutput.hookEventName is required.
 *
 * @param {string} xml
 * @returns {{hookSpecificOutput: {hookEventName: string, additionalContext: string}}}
 */
function buildHookOutput(xml) {
  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: xml || '',
    },
  };
}

module.exports = {
  loadCoreConfig,
  getStaleSessionTTL,
  resolveRuntimeBase,
  resolveHookRuntime,
  buildHookOutput,
};
