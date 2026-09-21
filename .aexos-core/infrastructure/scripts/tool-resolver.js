const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const fg = require('fast-glob');
const ToolValidationHelper = require('./tool-validation-helper');
const ToolHelperExecutor = require('./tool-helper-executor');
const { configuration, inspectHealth } = require('./tool-health');

const DEFAULT_SEARCH_PATHS = [
  '.aexos-core/infrastructure/tools',
  'aexos-core/tools',
  'common/tools',
  path.resolve(__dirname, '../tools'),
];

function globPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * ToolResolver - Resolves and loads AEXOS tools from file system
 *
 * Features:
 * - Map-based caching for performance (<5ms cached lookups)
 * - Search path priority: squad → common → core
 * - Glob-based file resolution
 * - Schema validation
 * - Health checking (tool_call, command, http methods)
 * - Schema version auto-detection
 *
 * Target Performance: <50ms for uncached resolution
 */
class ToolResolver {
  constructor() {
    // Map-based cache for fast lookups
    this.cache = new Map();

    // Base search paths (in priority order)
    this.basePaths = [...DEFAULT_SEARCH_PATHS];
  }

  /**
   * Resolve a tool by name
   *
   * @param {string} toolName - Tool identifier (e.g., 'clickup', 'github-cli')
   * @param {object} context - Resolution context (optional)
   * @param {string} context.expansionPack - Specific squad to search
   * @param {object} context.health - Explicit {execute:true, timeoutMs, signal, mcpExecutor}
   * Health is not checked during ordinary loading. Required checks reject unless
   * explicitly executed successfully. Definitions are cached; health results are not.
   * @returns {object} Tool definition with schema_version detected
   * @throws {Error} If tool not found or validation fails
   */
  async resolveTool(toolName, context = {}) {
    // 1. Check cache first (performance: <5ms cached)
    const cacheKey = JSON.stringify([
      process.cwd(),
      this.basePaths,
      context.expansionPack || 'core',
      toolName,
    ]);
    if (this.cache.has(cacheKey)) {
      return this._withHealth(this.cache.get(cacheKey), context.health);
    }

    // 2. Build search paths (squad → core priority)
    const searchPaths = [];
    if (context.expansionPack) {
      searchPaths.push(`squads/${context.expansionPack}/tools`);
    }
    searchPaths.push(...this.basePaths);

    // 3. Find tool file using glob (searches subdirectories)
    let toolPath = null;
    for (const basePath of searchPaths) {
      const candidates = fg.sync(`${globPath(basePath)}/**/${toolName}.yaml`);
      if (candidates.length > 0) {
        toolPath = candidates[0];
        break;
      }
    }

    if (!toolPath) {
      throw new Error(`Tool '${toolName}' not found in search paths: ${searchPaths.join(', ')}`);
    }

    // 4. Load and parse YAML
    const toolContent = await fs.readFile(toolPath, 'utf8');
    let toolDef = yaml.load(toolContent);

    // Extract tool object if wrapped (handles both formats)
    if (toolDef.tool) {
      // Some shipped definitions keep operational metadata beside their wrapper.
      // Preserve those fields while the explicit wrapped declaration takes precedence.
      const { tool, ...metadata } = toolDef;
      toolDef = { ...metadata, ...tool };
    }

    // 5. Validate schema
    await this.validateToolSchema(toolDef);

    // 6. Detect schema version (auto-detection if not specified)
    if (!toolDef.schema_version) {
      toolDef.schema_version = this.detectSchemaVersion(toolDef);
    }

    // Cache definitions only. Health observations never survive another resolution.
    toolDef._healthStatus = 'not_checked';
    this.cache.set(cacheKey, toolDef);
    return this._withHealth(toolDef, context.health);
  }

  async _withHealth(tool, options = {}) {
    const check = configuration(tool);
    const result = await inspectHealth(tool, options);
    if (check?.required && !result.healthy) {
      throw new Error(`Required tool '${tool.id}' health check failed: ${result.status}`);
    }
    if (result.status === 'not_checked') return tool;
    return { ...tool, _healthStatus: result.status, _healthResult: result };
  }

  /**
   * Validate tool schema structure
   *
   * @param {object} tool - Tool definition
   * @throws {Error} If required fields missing or invalid
   */
  async validateToolSchema(tool) {
    // Required fields for all tools
    const requiredFields = ['id', 'type', 'name', 'version', 'description'];

    for (const field of requiredFields) {
      if (!tool[field]) {
        throw new Error(`Tool missing required field: ${field}`);
      }
    }

    // Validate type enum
    const validTypes = ['mcp', 'cli', 'local', 'meta'];
    if (!validTypes.includes(tool.type)) {
      throw new Error(`Invalid tool type '${tool.type}'. Must be one of: ${validTypes.join(', ')}`);
    }

    // Validate version format (basic semver check)
    const semverPattern = /^\d+\.\d+\.\d+$/;
    if (!semverPattern.test(tool.version)) {
      throw new Error(`Invalid version format '${tool.version}'. Expected semantic versioning (e.g., 1.0.0)`);
    }

    // Validate schema_version if present (support both string and numeric formats)
    if (tool.schema_version) {
      const version = typeof tool.schema_version === 'number'
        ? tool.schema_version
        : parseFloat(tool.schema_version);

      if (![1.0, 2.0].includes(version)) {
        throw new Error(`Invalid schema_version '${tool.schema_version}'. Must be '1.0' or '2.0'`);
      }
    }

    // v2.0 specific validation
    if (tool.schema_version === '2.0' || tool.schema_version === 2.0) {
      await this.validateV2Schema(tool);
    }
  }

  /**
   * Validate v2.0 schema-specific features
   *
   * @param {object} tool - Tool definition
   * @throws {Error} If v2.0 features are invalid
   */
  async validateV2Schema(tool) {
    // Validate executable_knowledge if present
    if (tool.executable_knowledge) {
      const { helpers, validators } = tool.executable_knowledge;

      // Validate helpers
      if (helpers) {
        if (!Array.isArray(helpers)) {
          throw new Error('executable_knowledge.helpers must be an array');
        }
        for (const helper of helpers) {
          if (!helper.id || !helper.language || !helper.function) {
            throw new Error('Helper must have id, language, and function fields');
          }
          if (helper.language !== 'javascript') {
            throw new Error(`Unsupported helper language: ${helper.language}`);
          }
        }
      }

      // Validate validators
      if (validators) {
        if (!Array.isArray(validators)) {
          throw new Error('executable_knowledge.validators must be an array');
        }
        for (const validator of validators) {
          if (!validator.id || !validator.validates || !validator.function) {
            throw new Error('Validator must have id, validates, and function fields');
          }
        }
      }
    }

    // Validate anti_patterns if present
    if (tool.anti_patterns) {
      if (!Array.isArray(tool.anti_patterns)) {
        throw new Error('anti_patterns must be an array');
      }
      for (const pattern of tool.anti_patterns) {
        if (!pattern.pattern || !pattern.description || !pattern.wrong || !pattern.correct) {
          throw new Error('Anti-pattern must have pattern, description, wrong, and correct fields');
        }
      }
    }
  }

  /**
   * Detect schema version from tool features
   *
   * @param {object} tool - Tool definition
   * @returns {number} Detected schema version (1.0 or 2.0)
   */
  detectSchemaVersion(tool) {
    // Check for v2.0 features
    const hasExecutableKnowledge = !!tool.executable_knowledge;
    const hasApiComplexity = !!tool.api_complexity;
    const hasAntiPatterns = !!tool.anti_patterns;
    const hasEnhancedExamples = tool.examples &&
      Object.values(tool.examples).some(ex =>
        ex.some(e => e.scenario && ['success', 'failure_invalid_param'].includes(e.scenario)),
      );

    if (hasExecutableKnowledge || hasApiComplexity || hasAntiPatterns || hasEnhancedExamples) {
      return 2.0;
    }

    // Default to v1.0 (simple tools)
    return 1.0;
  }

  /**
   * Perform an explicitly authorized health check; unperformed checks return false.
   *
   * @param {object} tool - Tool definition with health_check config
   * @param {object} options - {execute:true, timeoutMs, signal, mcpExecutor}
   * @returns {boolean} True if healthy, false otherwise
   */
  async checkHealth(tool, options = {}) {
    return (await inspectHealth(tool, options)).healthy;
  }

  async inspectHealth(tool, options = {}) {
    return inspectHealth(tool, options);
  }

  /**
   * Clear cache (useful for testing or reloading tools)
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   *
   * @returns {object} Cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * List all available tools across all search paths
   *
   * @returns {Array<string>} Array of tool file paths
   */
  listAvailableTools() {
    const allTools = [];
    const seenPaths = new Set();
    for (const basePath of this.basePaths) {
      const tools = fg.sync(`${globPath(basePath)}/**/*.yaml`);
      for (const tool of tools) {
        const physicalPath = fs.realpathSync(tool);
        const key = process.platform === 'win32' ? physicalPath.toLowerCase() : physicalPath;
        if (!seenPaths.has(key)) {
          seenPaths.add(key);
          allTools.push(tool);
        }
      }
    }
    return allTools;
  }

  /**
   * Check if a tool exists without loading it
   *
   * @param {string} toolName - Tool identifier
   * @param {object} context - Resolution context
   * @returns {boolean} True if tool exists
   */
  async toolExists(toolName, context = {}) {
    const searchPaths = [];
    if (context.expansionPack) {
      searchPaths.push(`squads/${context.expansionPack}/tools`);
    }
    searchPaths.push(...this.basePaths);

    for (const basePath of searchPaths) {
      const candidates = fg.sync(`${globPath(basePath)}/**/${toolName}.yaml`);
      if (candidates.length > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Validate a command using the executable knowledge shipped with a tool.
   * This is opt-in and never dispatches the underlying MCP/CLI command.
   */
  async validateCommand(toolName, command, args = {}, context = {}) {
    const tool = await this.resolveTool(toolName, context);
    const validator = new ToolValidationHelper(tool.executable_knowledge, context.validationOptions);
    return validator.validate(command, args);
  }

  /**
   * Execute a data transformation helper shipped with a tool definition.
   * This is opt-in and never grants provider, filesystem, or process access.
   */
  async executeHelper(toolName, helperId, args = {}, context = {}) {
    const tool = await this.resolveTool(toolName, context);
    const executor = new ToolHelperExecutor(tool.executable_knowledge, context.helperOptions);
    return executor.execute(helperId, args);
  }

  /**
   * Set custom search paths (useful for testing)
   *
   * @param {string[]} paths - Array of search paths
   */
  setSearchPaths(paths) {
    this.basePaths = paths;
  }

  /**
   * Reset search paths to default
   */
  resetSearchPaths() {
    this.basePaths = [...DEFAULT_SEARCH_PATHS];
  }
}

// Export singleton instance
const toolResolverInstance = new ToolResolver();

// Save reference to instance method BEFORE it gets overwritten by the export
const yamlBasedResolveTool = toolResolverInstance.resolveTool.bind(toolResolverInstance);

/**
 * Simple tool resolution function - delegates to YAML-based tool resolution
 * All tools (including MCP tools like clickup and github) are loaded from YAML definitions
 *
 * @param {string} toolName - Name of the tool (e.g., 'clickup', 'github')
 * @param {object} context - Resolution context (optional, includes expansionPack)
 * @returns {object} Tool definition from YAML file
 */
async function resolveTool(toolName, context = {}) {
  // All tools go through YAML-based resolution
  return await yamlBasedResolveTool(toolName, context);
}

module.exports = toolResolverInstance;
module.exports.resolveTool = resolveTool;
