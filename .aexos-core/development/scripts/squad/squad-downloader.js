/**
 * Squad Downloader Utility
 *
 * Downloads squads from the aexos-squads GitHub repository.
 * Uses GitHub API for registry.json and raw file downloads.
 *
 * @module squad-downloader
 * @version 1.0.0
 * @see Story SQS-6: Download & Publish Tasks
 */

const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Default registry URL for aexos-squads
 * @constant {string}
 */
const REGISTRY_URL =
  'https://raw.githubusercontent.com/CyryxLabs/aexos-squads/main/registry.json';

/**
 * GitHub API base URL for aexos-squads contents
 * @constant {string}
 */
const GITHUB_API_BASE =
  'https://api.github.com/repos/CyryxLabs/aexos-squads/contents/packages';

const GITHUB_RAW_ORIGIN = 'https://raw.githubusercontent.com';
const MAX_REDIRECTS = 5;

/**
 * Default path for downloaded squads
 * @constant {string}
 */
const DEFAULT_SQUADS_PATH = './squads';

/**
 * Error codes for SquadDownloaderError
 * @enum {string}
 */
const DownloaderErrorCodes = {
  REGISTRY_FETCH_ERROR: 'REGISTRY_FETCH_ERROR',
  SQUAD_NOT_FOUND: 'SQUAD_NOT_FOUND',
  VERSION_NOT_FOUND: 'VERSION_NOT_FOUND',
  DOWNLOAD_ERROR: 'DOWNLOAD_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SQUAD_EXISTS: 'SQUAD_EXISTS',
  RATE_LIMIT: 'RATE_LIMIT',
};

/**
 * Custom error class for Squad Downloader operations
 * @extends Error
 */
class SquadDownloaderError extends Error {
  /**
   * Create a SquadDownloaderError
   * @param {string} code - Error code from DownloaderErrorCodes
   * @param {string} message - Human-readable error message
   * @param {string} [suggestion] - Suggested fix for the error
   */
  constructor(code, message, suggestion) {
    super(message);
    this.name = 'SquadDownloaderError';
    this.code = code;
    this.suggestion = suggestion || '';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SquadDownloaderError);
    }
  }

  /**
   * Returns formatted error string
   * @returns {string}
   */
  toString() {
    let str = `[${this.code}] ${this.message}`;
    if (this.suggestion) {
      str += `\n  Suggestion: ${this.suggestion}`;
    }
    return str;
  }
}

/**
 * Squad Downloader class for downloading squads from aexos-squads repository
 */
class SquadDownloader {
  /**
   * Create a SquadDownloader instance
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.squadsPath='./squads'] - Path to download squads to
   * @param {boolean} [options.verbose=false] - Enable verbose logging
   * @param {boolean} [options.overwrite=false] - Overwrite existing squads
   * @param {string} [options.registryUrl] - Custom registry URL
   * @param {string} [options.contentApiBase] - HTTPS contents API base
   * @param {string[]} [options.contentDownloadOrigins] - Trusted HTTPS origins for file bodies
   * @param {string} [options.githubToken] - GitHub token for API rate limits
   */
  constructor(options = {}) {
    this.squadsPath = options.squadsPath || DEFAULT_SQUADS_PATH;
    this.verbose = options.verbose || false;
    this.overwrite = options.overwrite || false;
    this.registryUrl = this._normalizeHttpsUrl(options.registryUrl || REGISTRY_URL, {
      allowPath: true,
      label: 'registryUrl',
    });
    this.contentApiBase = this._normalizeHttpsUrl(
      options.contentApiBase || GITHUB_API_BASE,
      { allowPath: true, label: 'contentApiBase', stripTrailingSlash: true },
    );
    this._contentApiOrigin = new URL(this.contentApiBase).origin;
    const defaultDownloadOrigins = [this._contentApiOrigin];
    if (this.contentApiBase === GITHUB_API_BASE) {
      defaultDownloadOrigins.push(GITHUB_RAW_ORIGIN);
    }
    const configuredOrigins = options.contentDownloadOrigins || defaultDownloadOrigins;
    if (!Array.isArray(configuredOrigins) || configuredOrigins.length === 0) {
      throw new TypeError('contentDownloadOrigins must be a non-empty array of HTTPS origins');
    }
    this.contentDownloadOrigins = [
      ...new Set(
        configuredOrigins.map((origin) =>
          this._normalizeHttpsUrl(origin, {
            allowPath: false,
            label: 'contentDownloadOrigins entry',
          }),
        ),
      ),
    ];
    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN || null;

    // Cache for registry data
    this._registryCache = null;
    this._registryCacheTime = null;
    this._cacheMaxAge = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Log message if verbose mode is enabled
   * @private
   * @param {string} message - Message to log
   */
  _log(message) {
    if (this.verbose) {
      console.log(`[SquadDownloader] ${message}`);
    }
  }

  /**
   * List available squads from registry
   *
   * @returns {Promise<Array<{name: string, version: string, description: string, type: string}>>}
   * @throws {SquadDownloaderError} REGISTRY_FETCH_ERROR if registry cannot be fetched
   *
   * @example
   * const downloader = new SquadDownloader();
   * const squads = await downloader.listAvailable();
   * // [{ name: 'etl-squad', version: '1.0.0', description: '...', type: 'official' }]
   */
  async listAvailable() {
    this._log('Listing available squads from registry');
    const registry = await this.fetchRegistry();

    const squads = [];

    // Add official squads
    if (registry.squads && registry.squads.official) {
      for (const squad of registry.squads.official) {
        squads.push({
          name: squad.name,
          version: squad.version || 'latest',
          description: squad.description || '',
          type: 'official',
          author: squad.author || 'CyryxLabs',
        });
      }
    }

    // Add community squads
    if (registry.squads && registry.squads.community) {
      for (const squad of registry.squads.community) {
        squads.push({
          name: squad.name,
          version: squad.version || 'latest',
          description: squad.description || '',
          type: 'community',
          author: squad.author || 'Community',
        });
      }
    }

    this._log(`Found ${squads.length} available squad(s)`);
    return squads;
  }

  /**
   * Download squad by name
   *
   * @param {string} squadName - Name of squad to download (can include @version)
   * @param {Object} [options={}] - Download options
   * @param {string} [options.version='latest'] - Specific version to download
   * @param {boolean} [options.validate=true] - Validate after download
   * @returns {Promise<{path: string, manifest: object, validation: object}>}
   * @throws {SquadDownloaderError} SQUAD_NOT_FOUND if squad doesn't exist in registry
   * @throws {SquadDownloaderError} SQUAD_EXISTS if squad exists and overwrite is false
   * @throws {SquadDownloaderError} DOWNLOAD_ERROR if download fails
   *
   * @example
   * const downloader = new SquadDownloader();
   * const result = await downloader.download('etl-squad');
   * // { path: './squads/etl-squad', manifest: {...}, validation: {...} }
   *
   * // With version
   * await downloader.download('etl-squad@2.0.0');
   */
  async download(squadName, options = {}) {
    if (typeof squadName !== 'string' || !squadName.trim()) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        'Squad name must be a non-empty string',
      );
    }

    // Parse name@version syntax
    let name = squadName;
    let version = options.version || 'latest';

    const atCount = (squadName.match(/@/g) || []).length;
    if (atCount > 1) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        'Squad name may contain at most one @version suffix',
      );
    }
    if (atCount === 1) {
      const parts = squadName.split('@');
      name = parts[0];
      version = parts[1] || 'latest';
    }

    this._assertSafeSquadName(name, 'Squad name');

    this._log(`Downloading squad: ${name}@${version}`);

    // 1. Check if squad already exists locally
    const rootPath = await this._prepareSquadsRoot();
    const rootIdentity = await this._captureRootIdentity(rootPath);
    const targetPath = this._resolveContainedPath(rootPath, name);
    const targetState = await this._pathState(targetPath);
    if (targetState && targetState.isSymbolicLink()) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `Refusing to replace symbolic link at ${targetPath}`,
      );
    }
    if (targetState && !targetState.isDirectory()) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `Squad destination is not a directory: ${targetPath}`,
      );
    }
    if (!this.overwrite && targetState) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.SQUAD_EXISTS,
        `Squad "${name}" already exists at ${targetPath}`,
        'Use --overwrite flag or delete existing squad first',
      );
    }

    // 2. Check registry for squad
    const registry = await this.fetchRegistry();
    const squadInfo = this._findSquad(registry, name);

    if (!squadInfo) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.SQUAD_NOT_FOUND,
        `Squad "${name}" not found in registry`,
        'Use *download-squad --list to see available squads',
      );
    }

    // 3. Verify version if specified
    if (version !== 'latest' && squadInfo.version !== version) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.VERSION_NOT_FOUND,
        `Squad "${name}" version ${version} is not available (catalog version: ${squadInfo.version || 'unspecified'})`,
        'Use *download-squad --list to see the available version',
      );
    }

    let stagingPath = await fs.mkdtemp(path.join(rootPath, '.aexos-download-'));
    const stagingIdentity = await this._capturePathIdentity(stagingPath);
    const transaction = {
      rootPath,
      rootIdentity,
      stagingPath,
      stagingIdentity,
    };
    try {
      // 4. Download into an isolated staging directory.
      await this._downloadSquadFiles(squadInfo, stagingPath, transaction);
      await this._assertDownloadLocation(transaction, stagingPath);
      await this._assertTreeSafe(stagingPath);

      // 5. Validate downloaded squad (optional).
      let validation = { valid: true, errors: [], warnings: [], skipped: true };
      if (options.validate !== false) {
        await this._assertDownloadLocation(transaction, stagingPath);
        const { SquadValidator } = require('./squad-validator');
        const validator = new SquadValidator({ verbose: this.verbose });
        try {
          validation = await validator.validate(stagingPath);
        } catch (error) {
          throw new SquadDownloaderError(
            DownloaderErrorCodes.VALIDATION_ERROR,
            `Squad validation failed to run: ${error.message}`,
          );
        }
        if (
          !validation ||
          validation.valid !== true ||
          !Array.isArray(validation.errors) ||
          validation.errors.length > 0 ||
          !Array.isArray(validation.warnings)
        ) {
          const details = Array.isArray(validation && validation.errors)
            ? validation.errors.map((entry) => entry.message || String(entry)).join('; ')
            : 'validator returned an invalid result';
          throw new SquadDownloaderError(
            DownloaderErrorCodes.VALIDATION_ERROR,
            `Downloaded squad is invalid: ${details}`,
          );
        }
      }

      // 6. A readable manifest with matching identity is mandatory even when
      // full structural validation is explicitly disabled.
      const { SquadLoader } = require('./squad-loader');
      const loader = new SquadLoader({ squadsPath: rootPath });
      let manifest;
      try {
        await this._assertDownloadLocation(transaction, stagingPath);
        manifest = await loader.loadManifest(stagingPath);
      } catch (error) {
        throw new SquadDownloaderError(
          DownloaderErrorCodes.VALIDATION_ERROR,
          `Downloaded squad manifest could not be loaded: ${error.message}`,
        );
      }
      this._assertManifestIdentity(manifest, squadInfo, name, version);

      // 7. Promote only after every check has passed. Existing content is
      // moved aside and restored if the staged rename fails.
      await this._promoteStagedDownload(
        stagingPath,
        targetPath,
        rootPath,
        rootIdentity,
        stagingIdentity,
      );
      stagingPath = null;

      this._log(`Squad "${name}" downloaded successfully to ${targetPath}`);
      return { path: targetPath, manifest, validation };
    } finally {
      if (stagingPath) {
        await this._removeStagingPath(rootPath, rootIdentity, stagingPath);
      }
    }
  }

  /**
   * Fetch registry from aexos-squads repository
   *
   * @returns {Promise<Object>} Registry data
   * @throws {SquadDownloaderError} REGISTRY_FETCH_ERROR if fetch fails
   */
  async fetchRegistry() {
    // Check cache
    if (
      this._registryCache &&
      this._registryCacheTime &&
      Date.now() - this._registryCacheTime < this._cacheMaxAge
    ) {
      this._log('Using cached registry');
      return this._registryCache;
    }

    this._log(`Fetching registry from: ${this.registryUrl}`);

    try {
      const registryOrigin = new URL(this.registryUrl).origin;
      const data = await this._fetch(this.registryUrl, false, 0, [registryOrigin]);
      const registry = JSON.parse(data.toString('utf-8'));
      this._validateRegistry(registry);

      // Update cache
      this._registryCache = registry;
      this._registryCacheTime = Date.now();

      return registry;
    } catch (error) {
      if (error.code === 'RATE_LIMIT') {
        throw error;
      }
      throw new SquadDownloaderError(
        DownloaderErrorCodes.REGISTRY_FETCH_ERROR,
        `Failed to fetch registry: ${error.message}`,
        'Check network connection or try again later',
      );
    }
  }

  /**
   * Find squad in registry
   * @private
   * @param {Object} registry - Registry data
   * @param {string} name - Squad name
   * @returns {Object|null} Squad info or null
   */
  _findSquad(registry, name) {
    if (!registry || !registry.squads) {
      return null;
    }

    // Check official squads
    if (registry.squads.official) {
      const found = registry.squads.official.find((s) => s.name === name);
      if (found) {
        return { ...found, type: 'official' };
      }
    }

    // Check community squads
    if (registry.squads.community) {
      const found = registry.squads.community.find((s) => s.name === name);
      if (found) {
        return { ...found, type: 'community' };
      }
    }

    return null;
  }

  /**
   * Download squad files from GitHub
   * @private
   * @param {Object} squadInfo - Squad info from registry
   * @param {string} targetPath - Local path to download to
   */
  async _downloadSquadFiles(squadInfo, targetPath, transaction) {
    this._log(`Downloading files to: ${targetPath}`);

    await this._assertDownloadLocation(transaction, targetPath);

    // Get squad files from GitHub API
    this._assertSafeSquadName(squadInfo.name, 'Catalog squad name');
    const apiUrl = `${this.contentApiBase}/${encodeURIComponent(squadInfo.name)}`;
    let contents;

    try {
      const data = await this._fetch(apiUrl, true, 0, [this._contentApiOrigin]);
      contents = JSON.parse(data.toString('utf-8'));
    } catch (error) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `Failed to fetch squad contents: ${error.message}`,
        'Squad may not exist in repository yet',
      );
    }

    if (!Array.isArray(contents)) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        'Invalid response from GitHub API',
        'Check if squad exists in aexos-squads repository',
      );
    }

    // Download each file/directory recursively
    await this._downloadContents(contents, targetPath, transaction);

    this._log(`Downloaded ${contents.length} items to ${targetPath}`);
  }

  /**
   * Download contents recursively
   * @private
   * @param {Array} contents - GitHub API contents array
   * @param {string} targetPath - Local target path
   */
  async _downloadContents(contents, targetPath, transaction) {
    if (!Array.isArray(contents)) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        'Invalid directory response from contents API',
      );
    }

    await this._assertDownloadLocation(transaction, targetPath);
    const rootPath = path.resolve(targetPath);
    for (const item of contents) {
      if (!item || typeof item !== 'object') {
        throw new SquadDownloaderError(
          DownloaderErrorCodes.DOWNLOAD_ERROR,
          'Invalid content entry from contents API',
        );
      }
      this._assertSafeSegment(item.name, 'Content name');
      const itemPath = this._resolveContainedPath(rootPath, item.name);
      if (await this._pathState(itemPath)) {
        throw new SquadDownloaderError(
          DownloaderErrorCodes.DOWNLOAD_ERROR,
          `Duplicate or pre-existing content path: ${item.name}`,
        );
      }

      if (item.type === 'file') {
        // Download file - Buffer is written directly (supports binary files)
        this._log(`Downloading: ${item.name}`);
        const fileUrl = this._assertAllowedRemoteUrl(
          item.download_url,
          this.contentDownloadOrigins,
          'download URL',
        );
        const fileContent = await this._fetch(
          fileUrl,
          false,
          0,
          this.contentDownloadOrigins,
        );
        await this._assertDownloadLocation(transaction, targetPath);
        if (await this._pathState(itemPath)) {
          throw new SquadDownloaderError(
            DownloaderErrorCodes.DOWNLOAD_ERROR,
            `Content path appeared while downloading: ${item.name}`,
          );
        }
        await this._assertDownloadLocation(transaction, targetPath);
        await fs.writeFile(itemPath, fileContent, { flag: 'wx' });
      } else if (item.type === 'dir') {
        // Create directory and download contents
        const directoryUrl = this._assertAllowedRemoteUrl(
          item.url,
          [this._contentApiOrigin],
          'directory URL',
        );
        await this._assertDownloadLocation(transaction, targetPath);
        if (await this._pathState(itemPath)) {
          throw new SquadDownloaderError(
            DownloaderErrorCodes.DOWNLOAD_ERROR,
            `Content path appeared while downloading: ${item.name}`,
          );
        }
        await this._assertDownloadLocation(transaction, targetPath);
        await fs.mkdir(itemPath);
        const dirContents = await this._fetch(
          directoryUrl,
          true,
          0,
          [this._contentApiOrigin],
        );
        let parsed;
        try {
          parsed = JSON.parse(dirContents.toString('utf-8'));
        } catch (error) {
          throw new SquadDownloaderError(
            DownloaderErrorCodes.DOWNLOAD_ERROR,
            `Invalid directory response: ${error.message}`,
          );
        }
        await this._downloadContents(parsed, itemPath, transaction);
      } else {
        throw new SquadDownloaderError(
          DownloaderErrorCodes.DOWNLOAD_ERROR,
          `Unsupported content entry type: ${item.type || 'missing'}`,
        );
      }
    }
  }

  /**
   * Make HTTPS request
   * @private
   * @param {string} url - URL to fetch
   * @param {boolean} [useApi=false] - Whether to use GitHub API headers
   * @returns {Promise<Buffer>} Response body as Buffer (supports binary files)
   */
  _fetch(url, useApi = false, redirectCount = 0, allowedOrigins = null) {
    return new Promise((resolve, reject) => {
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
          throw new Error('only credential-free HTTPS URLs are supported');
        }
        if (allowedOrigins && !allowedOrigins.includes(parsedUrl.origin)) {
          throw new Error(`untrusted remote origin: ${parsedUrl.origin}`);
        }
      } catch (error) {
        reject(
          new SquadDownloaderError(
            DownloaderErrorCodes.NETWORK_ERROR,
            `Invalid request URL: ${error.message}`,
          ),
        );
        return;
      }
      const options = {
        headers: {
          'User-Agent': 'AEXOS-SquadDownloader/1.0',
        },
      };

      if (useApi) {
        options.headers['Accept'] = 'application/vnd.github.v3+json';
        if (this.githubToken && parsedUrl.origin === this._contentApiOrigin) {
          options.headers['Authorization'] = `token ${this.githubToken}`;
        }
      }

      https
        .get(url, options, (res) => {
          // Check for rate limiting
          if (res.statusCode === 403) {
            const rateLimitRemaining = res.headers['x-ratelimit-remaining'];
            if (rateLimitRemaining === '0') {
              const resetTime = res.headers['x-ratelimit-reset'];
              const resetSeconds = Number.parseInt(resetTime, 10);
              const resetDate = new Date(resetSeconds * 1000);
              const resetMessage = Number.isFinite(resetDate.getTime())
                ? ` Resets at ${resetDate.toISOString()}`
                : '';
              if (typeof res.resume === 'function') res.resume();
              reject(
                new SquadDownloaderError(
                  DownloaderErrorCodes.RATE_LIMIT,
                  `GitHub API rate limit exceeded.${resetMessage}`,
                  'Set GITHUB_TOKEN environment variable to increase rate limit',
                ),
              );
              return;
            }
          }

          // Check for redirect
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (typeof res.resume === 'function') res.resume();
            if (redirectCount >= MAX_REDIRECTS) {
              reject(
                new SquadDownloaderError(
                  DownloaderErrorCodes.NETWORK_ERROR,
                  `Too many redirects (maximum ${MAX_REDIRECTS})`,
                ),
              );
              return;
            }
            let redirectUrl;
            try {
              redirectUrl = new URL(res.headers.location, parsedUrl).toString();
            } catch (error) {
              reject(
                new SquadDownloaderError(
                  DownloaderErrorCodes.NETWORK_ERROR,
                  `Invalid redirect URL: ${error.message}`,
                ),
              );
              return;
            }
            this._fetch(redirectUrl, useApi, redirectCount + 1, allowedOrigins)
              .then(resolve)
              .catch(reject);
            return;
          }

          // Check for errors
          if (res.statusCode !== 200) {
            if (typeof res.resume === 'function') res.resume();
            reject(
              new SquadDownloaderError(
                DownloaderErrorCodes.NETWORK_ERROR,
                `HTTP ${res.statusCode}: ${res.statusMessage}`,
              ),
            );
            return;
          }

          // Collect chunks as Buffer objects to support binary files
          const chunks = [];
          res.on('data', (chunk) => {
            chunks.push(chunk);
          });
          res.on('end', () => {
            // Concatenate all chunks into a single Buffer
            resolve(Buffer.concat(chunks));
          });
        })
        .on('error', (error) => {
          reject(
            new SquadDownloaderError(
              DownloaderErrorCodes.NETWORK_ERROR,
              `Network error: ${error.message}`,
              'Check internet connection',
            ),
          );
        });
    });
  }

  /**
   * Check if path exists
   * @private
   * @param {string} filePath - Path to check
   * @returns {Promise<boolean>}
   */
  async _pathExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  _normalizeHttpsUrl(value, options = {}) {
    const { allowPath = true, label = 'URL', stripTrailingSlash = false } = options;
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new TypeError(`${label} must be a valid HTTPS URL`);
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new TypeError(`${label} must be a credential-free HTTPS URL`);
    }
    if (parsed.search || parsed.hash) {
      throw new TypeError(`${label} must not contain a query string or fragment`);
    }
    if (!allowPath && parsed.pathname !== '/') {
      throw new TypeError(`${label} must be an origin without a path`);
    }
    let normalized = allowPath ? parsed.toString() : parsed.origin;
    if (stripTrailingSlash) normalized = normalized.replace(/\/$/, '');
    return normalized;
  }

  _assertAllowedRemoteUrl(value, allowedOrigins, label) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `${label} is not a valid URL`,
      );
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      !allowedOrigins.includes(parsed.origin)
    ) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `${label} uses an untrusted origin: ${parsed.origin || value}`,
      );
    }
    return parsed.toString();
  }

  _assertSafeSquadName(value, label) {
    if (
      typeof value !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ||
      value === '.' ||
      value === '..'
    ) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `${label} must be a single safe path segment`,
      );
    }
  }

  _assertSafeSegment(value, label) {
    const windowsReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
    const hasControlCharacter =
      typeof value === 'string' &&
      Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint <= 31 || codePoint === 127;
      });
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value === '.' ||
      value === '..' ||
      value.includes('/') ||
      value.includes('\\') ||
      value.includes(':') ||
      hasControlCharacter ||
      /[. ]$/.test(value) ||
      windowsReserved.test(value)
    ) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `${label} must be a safe single file name`,
      );
    }
  }

  _resolveContainedPath(rootPath, segment) {
    const resolvedRoot = path.resolve(rootPath);
    const resolved = path.resolve(resolvedRoot, segment);
    if (resolved === resolvedRoot || !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `Resolved path escapes the squads directory: ${segment}`,
      );
    }
    return resolved;
  }

  async _pathState(filePath) {
    try {
      return await fs.lstat(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async _prepareSquadsRoot() {
    const requestedRoot = path.resolve(this.squadsPath);
    const existing = await this._pathState(requestedRoot);
    if (existing && existing.isSymbolicLink()) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `Squads directory must not be a symbolic link: ${requestedRoot}`,
      );
    }
    if (existing && !existing.isDirectory()) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `Squads path is not a directory: ${requestedRoot}`,
      );
    }
    if (!existing) await fs.mkdir(requestedRoot, { recursive: true });
    return fs.realpath(requestedRoot);
  }

  _validateRegistry(registry) {
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
      throw new Error('registry must be an object');
    }
    if (!registry.squads || typeof registry.squads !== 'object' || Array.isArray(registry.squads)) {
      throw new Error('registry.squads must be an object');
    }
    for (const group of ['official', 'community']) {
      if (!Array.isArray(registry.squads[group])) {
        throw new Error(`registry.squads.${group} must be an array`);
      }
      for (const entry of registry.squads[group]) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          throw new Error(`registry.squads.${group} contains an invalid entry`);
        }
        this._assertSafeSquadName(entry.name, 'Catalog squad name');
        if (
          entry.version !== undefined &&
          (typeof entry.version !== 'string' || !entry.version.trim())
        ) {
          throw new Error(`registry entry ${entry.name} has an invalid version`);
        }
      }
    }
  }

  _assertManifestIdentity(manifest, squadInfo, requestedName, requestedVersion) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.VALIDATION_ERROR,
        'Downloaded squad manifest must be an object',
      );
    }
    if (manifest.name !== requestedName || manifest.name !== squadInfo.name) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.VALIDATION_ERROR,
        `Downloaded manifest name "${manifest.name}" does not match catalog name "${squadInfo.name}"`,
      );
    }
    const catalogVersion = squadInfo.version;
    const expectedVersion = requestedVersion === 'latest' ? catalogVersion : requestedVersion;
    if (
      typeof manifest.version !== 'string' ||
      (expectedVersion && expectedVersion !== 'latest' && manifest.version !== expectedVersion)
    ) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.VALIDATION_ERROR,
        `Downloaded manifest version "${manifest.version}" does not match expected version "${expectedVersion || 'unspecified'}"`,
      );
    }
  }

  async _assertTreeSafe(rootPath) {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = this._resolveContainedPath(rootPath, entry.name);
      const state = await fs.lstat(entryPath);
      if (state.isSymbolicLink()) {
        throw new SquadDownloaderError(
          DownloaderErrorCodes.DOWNLOAD_ERROR,
          `Downloaded content contains a symbolic link: ${entry.name}`,
        );
      }
      if (state.isDirectory()) await this._assertTreeSafe(entryPath);
    }
  }

  async _promoteStagedDownload(
    stagingPath,
    targetPath,
    rootPath,
    rootIdentity,
    stagingIdentity,
  ) {
    await this._assertRootIdentity(rootPath, rootIdentity);
    await this._assertDownloadLocation(
      { rootPath, rootIdentity, stagingPath, stagingIdentity },
      stagingPath,
    );
    const existing = await this._pathState(targetPath);
    if (existing && existing.isSymbolicLink()) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `Refusing to replace symbolic link at ${targetPath}`,
      );
    }
    if (existing && !existing.isDirectory()) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `Squad destination is not a directory: ${targetPath}`,
      );
    }
    if (existing && !this.overwrite) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.SQUAD_EXISTS,
        `Squad destination appeared while downloading: ${targetPath}`,
        'Retry after reviewing the existing squad, or use --overwrite',
      );
    }
    if (!existing) {
      await fs.rename(stagingPath, targetPath);
      return;
    }

    await this._assertRootIdentity(rootPath, rootIdentity);
    const backupContainer = await fs.mkdtemp(path.join(rootPath, '.aexos-backup-'));
    const backupPath = this._resolveContainedPath(backupContainer, crypto.randomUUID());
    await this._assertRootIdentity(rootPath, rootIdentity);
    await fs.rename(targetPath, backupPath);
    try {
      await this._assertDownloadLocation(
        { rootPath, rootIdentity, stagingPath, stagingIdentity },
        stagingPath,
      );
      await fs.rename(stagingPath, targetPath);
    } catch (error) {
      try {
        await fs.rename(backupPath, targetPath);
      } catch (rollbackError) {
        throw new SquadDownloaderError(
          DownloaderErrorCodes.DOWNLOAD_ERROR,
          `Failed to promote staged squad and restore existing content: ${error.message}; rollback: ${rollbackError.message}; original retained at ${backupPath}`,
        );
      }
      await fs.rmdir(backupContainer).catch(() => {});
      throw error;
    }
    await this._removeOwnedDirectory(
      rootPath,
      rootIdentity,
      backupContainer,
      '.aexos-backup-',
    ).catch((error) => {
      this._log(`Warning: failed to remove download backup ${backupContainer}: ${error.message}`);
    });
  }

  async _capturePathIdentity(filePath) {
    const state = await fs.stat(filePath);
    return { dev: state.dev, ino: state.ino };
  }

  async _captureRootIdentity(rootPath) {
    return this._capturePathIdentity(rootPath);
  }

  async _assertRootIdentity(rootPath, expectedIdentity) {
    const requestedRoot = path.resolve(this.squadsPath);
    const requestedState = await fs.lstat(requestedRoot);
    if (requestedState.isSymbolicLink()) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `Squads directory became a symbolic link: ${requestedRoot}`,
      );
    }
    const currentRealPath = await fs.realpath(requestedRoot);
    const currentState = await fs.stat(currentRealPath);
    if (
      path.resolve(currentRealPath) !== path.resolve(rootPath) ||
      currentState.dev !== expectedIdentity.dev ||
      currentState.ino !== expectedIdentity.ino
    ) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        'Squads directory changed while the download was in progress',
      );
    }
  }

  async _assertDownloadLocation(transaction, mutationParent) {
    if (!transaction) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        'Missing staged download transaction',
      );
    }
    const { rootPath, rootIdentity, stagingPath, stagingIdentity } = transaction;
    await this._assertRootIdentity(rootPath, rootIdentity);

    const resolvedStage = path.resolve(stagingPath);
    const resolvedParent = path.resolve(mutationParent);
    const relativeParent = path.relative(resolvedStage, resolvedParent);
    if (
      relativeParent === '..' ||
      relativeParent.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeParent)
    ) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `Mutation path escapes the staged download: ${mutationParent}`,
      );
    }

    const stageState = await fs.lstat(resolvedStage);
    if (stageState.isSymbolicLink() || !stageState.isDirectory()) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        'Staged download directory was replaced',
      );
    }
    const currentStageIdentity = await this._capturePathIdentity(resolvedStage);
    const currentStageRealPath = await fs.realpath(resolvedStage);
    if (
      path.resolve(currentStageRealPath) !== resolvedStage ||
      currentStageIdentity.dev !== stagingIdentity.dev ||
      currentStageIdentity.ino !== stagingIdentity.ino
    ) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        'Staged download directory identity changed',
      );
    }

    let ancestorPath = resolvedStage;
    const components = relativeParent ? relativeParent.split(path.sep) : [];
    for (const component of components) {
      ancestorPath = path.join(ancestorPath, component);
      const state = await fs.lstat(ancestorPath);
      if (state.isSymbolicLink() || !state.isDirectory()) {
        throw new SquadDownloaderError(
          DownloaderErrorCodes.DOWNLOAD_ERROR,
          `Staged download ancestor is not a real directory: ${ancestorPath}`,
        );
      }
    }
  }

  async _removeStagingPath(rootPath, rootIdentity, stagingPath) {
    return this._removeOwnedDirectory(
      rootPath,
      rootIdentity,
      stagingPath,
      '.aexos-download-',
    );
  }

  async _removeOwnedDirectory(rootPath, rootIdentity, ownedPath, expectedPrefix) {
    await this._assertRootIdentity(rootPath, rootIdentity);
    const resolvedRoot = path.resolve(rootPath);
    const resolvedOwned = path.resolve(ownedPath);
    if (
      !resolvedOwned.startsWith(`${resolvedRoot}${path.sep}`) ||
      !path.basename(resolvedOwned).startsWith(expectedPrefix)
    ) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `Refusing to remove untrusted temporary path: ${ownedPath}`,
      );
    }
    const ownedState = await this._pathState(resolvedOwned);
    if (!ownedState) return;
    if (ownedState.isSymbolicLink() || !ownedState.isDirectory()) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `Refusing to recursively remove unsafe temporary path: ${ownedPath}`,
      );
    }
    const realOwned = await fs.realpath(resolvedOwned);
    if (!realOwned.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new SquadDownloaderError(
        DownloaderErrorCodes.DOWNLOAD_ERROR,
        `Temporary path changed outside the squads directory: ${ownedPath}`,
      );
    }
    await fs.rm(resolvedOwned, { recursive: true, force: true });
  }

  /**
   * Clear registry cache
   */
  clearCache() {
    this._registryCache = null;
    this._registryCacheTime = null;
    this._log('Registry cache cleared');
  }
}

module.exports = {
  SquadDownloader,
  SquadDownloaderError,
  DownloaderErrorCodes,
  REGISTRY_URL,
  GITHUB_API_BASE,
  DEFAULT_SQUADS_PATH,
};
