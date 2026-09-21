/**
 * Template Loader Module
 * Responsible for loading and parsing Handlebars templates with YAML frontmatter
 *
 * @module loader
 * @version 2.0.0
 */

'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function isDeclaredPath(filePath) {
  try {
    fsSync.lstatSync(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * Parse template content separating frontmatter from body
 * @param {string} content - Raw template content
 * @returns {Object} Parsed template with metadata and body
 */
function parseTemplate(content) {
  // Normalize line endings to Unix-style for consistent parsing
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = normalizedContent.match(frontmatterRegex);

  if (!match) {
    throw new Error('Invalid template format: missing YAML frontmatter');
  }

  const [, frontmatter, body] = match;
  let metadata;

  try {
    metadata = yaml.load(frontmatter);
  } catch (error) {
    throw new Error(`Failed to parse template frontmatter: ${error.message}`);
  }

  return {
    metadata,
    body: body.trim(),
  };
}

/**
 * Validate template metadata structure
 * @param {Object} metadata - Template metadata from frontmatter
 * @throws {Error} If required fields are missing or metadata is invalid
 */
function validateMetadata(metadata) {
  // Guard against non-object metadata (null, undefined, scalar values)
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('Template metadata must be a valid object');
  }

  const requiredFields = ['template_id', 'template_name', 'version'];
  const missingFields = requiredFields.filter(field => !metadata[field]);

  if (missingFields.length > 0) {
    throw new Error(`Template missing required fields: ${missingFields.join(', ')}`);
  }

  if (metadata.variables && !Array.isArray(metadata.variables)) {
    throw new Error('Template variables must be an array');
  }
}

/**
 * TemplateLoader class for loading and managing templates
 */
class TemplateLoader {
  /**
   * Create a TemplateLoader instance
   * @param {Object} options - Configuration options
   * @param {string} options.templatesDir - Path to templates directory
   */
  constructor(options = {}) {
    this.templatesDir = options.templatesDir ||
      path.join(process.cwd(), '.aexos-core', 'product', 'templates');
    this.fallbackTemplatesDir = options.fallbackTemplatesDir || null;
    this.cache = new Map();
  }

  /**
   * Load a template by type
   * @param {string} templateType - Template type (prd, adr, pmdr, dbdr, story, epic, task)
   * @param {Object} options - Load options
   * @param {boolean} options.useCache - Whether to use cached template (default: true)
   * @returns {Promise<Object>} Loaded template object
   */
  async load(templateType, options = {}) {
    const { useCache = true } = options;

    if (useCache && this.cache.has(templateType)) {
      return this.cache.get(templateType);
    }

    const templatePath = this.resolveTemplatePath(templateType);

    let content;
    try {
      content = await fs.readFile(templatePath, 'utf-8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Template not found: ${templateType} (${templatePath})`);
      }
      throw new Error(`Failed to read template ${templateType}: ${error.message}`);
    }

    const { metadata, body } = parseTemplate(content);
    validateMetadata(metadata);

    const template = {
      type: templateType,
      path: templatePath,
      metadata,
      body,
      variables: this.normalizeVariables(metadata.variables || []),
    };

    if (useCache) {
      this.cache.set(templateType, template);
    }

    return template;
  }

  /**
   * Resolve the file path for a template type
   * @param {string} templateType - Template type identifier
   * @returns {string} Full path to template file
   */
  resolveTemplatePath(templateType) {
    const extensions = ['.hbs', '.handlebars', '.md'];

    // Handle versioned templates (e.g., prd-v2 -> prd-v2.0.hbs)
    const templateAliases = {
      'prd-v2': 'prd-v2.0',
    };

    const templateName = templateAliases[templateType] || templateType;
    const directories = [this.templatesDir];
    if (this.fallbackTemplatesDir && this.fallbackTemplatesDir !== this.templatesDir) {
      directories.push(this.fallbackTemplatesDir);
    }

    // Resolve each complete primary path before considering the package fallback.
    for (const directory of directories) {
      const basePath = path.join(directory, templateName);
      for (const ext of extensions) {
        const fullPath = basePath + ext;
        if (isDeclaredPath(fullPath)) return fullPath;
      }
    }

    // Preserve the primary path in missing-template errors.
    return path.join(this.templatesDir, templateName) + '.hbs';
  }

  /**
   * Normalize variable definitions to consistent format
   * @param {Array} variables - Raw variable definitions
   * @returns {Array} Normalized variable definitions
   */
  normalizeVariables(variables) {
    return variables.map(variable => ({
      name: variable.name,
      type: variable.type || 'string',
      // Variables with requiredIf are NOT required by default - they're conditionally required
      required: variable.requiredIf ? false : (variable.required !== false),
      requiredIf: variable.requiredIf,
      default: variable.default,
      prompt: variable.prompt || `Enter ${variable.name}:`,
      choices: variable.choices,
      auto: variable.auto,
      validation: variable.validation,
    }));
  }

  /**
   * List all available templates
   * @returns {Promise<Array>} List of template types
   */
  async listTemplates() {
    const directories = [this.templatesDir];
    if (this.fallbackTemplatesDir && this.fallbackTemplatesDir !== this.templatesDir) {
      directories.push(this.fallbackTemplatesDir);
    }
    const templates = new Set();

    for (const [index, directory] of directories.entries()) {
      let files;
      try {
        files = await fs.readdir(directory);
      } catch (error) {
        const missingPrimaryWithFallback = index === 0 && directories.length > 1 &&
          error.code === 'ENOENT';
        if (missingPrimaryWithFallback) continue;
        throw new Error(`Failed to list templates: ${error.message}`);
      }

      for (const file of files) {
        if (file.endsWith('.hbs') || file.endsWith('.handlebars')) {
          templates.add(path.basename(file, path.extname(file)));
        }
      }
    }

    return Array.from(templates);
  }

  /**
   * Clear the template cache
   * @param {string} templateType - Specific template to clear, or all if not provided
   */
  clearCache(templateType) {
    if (templateType) {
      this.cache.delete(templateType);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Check if a template exists
   * @param {string} templateType - Template type to check
   * @returns {Promise<boolean>} True if template exists
   */
  async exists(templateType) {
    try {
      await this.load(templateType, { useCache: false });
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = {
  TemplateLoader,
  parseTemplate,
  validateMetadata,
};
