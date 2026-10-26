/**
 * Subagent Prompt Builder - Assembles prompts from REAL TASKS
 *
 * This module does NOT generate generic prompts. Instead, it loads:
 * - Complete agent definition (.md file)
 * - Complete task definition (.md file)
 * - Referenced checklists
 * - Referenced templates
 *
 * The subagent receives the FULL task instructions, not a summary.
 *
 * @module core/orchestration/subagent-prompt-builder
 * @version 1.0.0
 */

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Builds structured prompts for subagents using real task definitions
 */
class SubagentPromptBuilder {
  /**
   * @param {string} projectRoot - Consumer project root directory
   * @param {Object} options - Path options
   * @param {string} options.frameworkRoot - AEXOS package root
   */
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.frameworkRoot = path.resolve(options.frameworkRoot || projectRoot);
    this.cyryxCoreRoot = path.join(this.frameworkRoot, '.aexos-core');

    // Paths to AEXOS components
    this.paths = {
      agents: path.join(this.cyryxCoreRoot, 'development', 'agents'),
      tasks: path.join(this.cyryxCoreRoot, 'development', 'tasks'),
      checklists: path.join(this.cyryxCoreRoot, 'product', 'checklists'),
      templates: path.join(this.cyryxCoreRoot, 'product', 'templates'),
    };
  }

  _unsafeReference(code, value) {
    const error = new Error(`Unsafe framework definition reference: ${value}`);
    error.code = code;
    return error;
  }

  async _resolveFrameworkFile(root, value, extensions, code) {
    if (typeof value !== 'string') throw this._unsafeReference(code, value);
    const requested = value.trim().replace(/^\*/, '');
    const extensionPattern = new RegExp(`(${extensions.map((ext) => ext.replace('.', '\\.')).join('|')})$`, 'i');
    const base = requested.replace(extensionPattern, '');
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(base)) {
      throw this._unsafeReference(code, value);
    }
    const requestedExtension = requested.slice(base.length);
    const candidates = requestedExtension
      ? [requestedExtension.toLowerCase()]
      : extensions;
    if (candidates.some((extension) => !extensions.includes(extension))) {
      throw this._unsafeReference(code, value);
    }
    const absoluteRoot = path.resolve(root);
    for (const extension of candidates) {
      const candidate = path.resolve(absoluteRoot, `${base}${extension}`);
      const relative = path.relative(absoluteRoot, candidate);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw this._unsafeReference(code, value);
      }
      if (!(await fs.pathExists(candidate))) continue;
      const [realRoot, realCandidate] = await Promise.all([
        fs.realpath(absoluteRoot),
        fs.realpath(candidate),
      ]);
      const realRelative = path.relative(realRoot, realCandidate);
      if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
        throw this._unsafeReference(code, value);
      }
      return realCandidate;
    }
    return null;
  }

  /**
   * Build a complete prompt for a subagent
   * Loads REAL task files, NOT generic prompts
   *
   * @param {string} agentId - Agent identifier (e.g., 'architect', 'data-engineer')
   * @param {string} taskFile - Task file name (e.g., 'document-project.md')
   * @param {Object} context - Execution context
   * @returns {Promise<string>} Complete prompt for subagent
   */
  async buildPrompt(agentId, taskFile, context = {}) {
    // 1. Load complete agent definition
    const agentDef = await this.loadAgentDefinition(agentId, context.strictDefinitions);

    // 2. Load complete task definition
    const taskDef = await this.loadTaskDefinition(taskFile, {
      strict: context.strictDefinitions,
      // A workflow-authored action can be an agent command or a manual prompt.
      // Explicit task references must still load their actual task file.
      fallbackInstructions: !context.phase?.task && context.phase?.action ? context.notes : null,
    });

    // 3. Extract and load referenced checklists from task
    const checklists = await this.extractAndLoadChecklists(taskDef, context.checklist);

    // 4. Extract and load referenced templates from task
    const templates = await this.extractAndLoadTemplates(taskDef, context.template);

    // 5. Build context section from previous phases
    const contextSection = this.formatContextSection(context);

    // 6. Assemble the complete prompt
    return this.assemblePrompt({
      agentId,
      agentDef,
      taskFile,
      taskDef,
      checklists,
      templates,
      context,
      contextSection,
    });
  }

  /**
   * Load complete agent definition file
   * @param {string} agentId - Agent identifier
   * @returns {Promise<string>} Complete agent .md file content
   */
  async loadAgentDefinition(agentId, strict = false) {
    const filePath = await this._resolveFrameworkFile(
      this.paths.agents,
      agentId,
      ['.md'],
      'WORKFLOW_AGENT_ID_INVALID',
    );
    if (filePath) return await fs.readFile(filePath, 'utf8');

    if (strict) throw new Error(`Agent definition not found: ${agentId}`);
    // Legacy callers may request a diagnostic prompt.
    console.warn(`[SubagentPromptBuilder] Agent definition not found: ${agentId}`);
    return `# Agent: ${agentId}\nNo definition file found.`;
  }

  /**
   * Load complete task definition file
   * @param {string} taskFile - Task file name
   * @returns {Promise<string>} Complete task .md file content
   */
  async loadTaskDefinition(taskFile, options = {}) {
    const filePath = await this._resolveFrameworkFile(
      this.paths.tasks,
      taskFile,
      ['.md'],
      'WORKFLOW_TASK_ID_INVALID',
    );
    if (filePath) return await fs.readFile(filePath, 'utf8');

    if (options.fallbackInstructions) return `# Workflow action: ${taskFile}\n\n${options.fallbackInstructions}`;
    if (options.strict) throw new Error(`Task definition not found: ${taskFile}`);
    console.warn(`[SubagentPromptBuilder] Task definition not found: ${taskFile}`);
    return `# Task: ${taskFile}\nNo definition file found.`;
  }

  /**
   * Extract checklist references from task and load them
   * @param {string} taskDef - Task definition content
   * @param {string} overrideChecklist - Checklist from phase config (takes precedence)
   * @returns {Promise<Object[]>} Array of loaded checklists
   */
  async extractAndLoadChecklists(taskDef, overrideChecklist = null) {
    const checklists = [];

    // Priority 1: Override checklist from phase config
    if (overrideChecklist) {
      const content = await this.loadChecklist(overrideChecklist);
      if (content) {
        checklists.push({ name: overrideChecklist, content });
      }
    }

    // Priority 2: Checklists referenced in task frontmatter
    const frontmatterMatch = taskDef.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      try {
        const frontmatter = yaml.load(frontmatterMatch[1]);
        if (frontmatter?.checklists) {
          for (const checklistName of frontmatter.checklists) {
            if (checklistName !== overrideChecklist) {
              const content = await this.loadChecklist(checklistName);
              if (content) {
                checklists.push({ name: checklistName, content });
              }
            }
          }
        }
      } catch (_e) {
        // Invalid YAML frontmatter - continue
      }
    }

    return checklists;
  }

  /**
   * Load a single checklist file
   * @param {string} checklistName - Checklist file name
   * @returns {Promise<string|null>} Checklist content or null
   */
  async loadChecklist(checklistName) {
    const filePath = await this._resolveFrameworkFile(
      this.paths.checklists,
      checklistName,
      ['.md'],
      'WORKFLOW_CHECKLIST_ID_INVALID',
    );
    if (filePath) return await fs.readFile(filePath, 'utf8');

    return null;
  }

  /**
   * Extract template references from task and load them
   * @param {string} taskDef - Task definition content
   * @param {string} overrideTemplate - Template from phase config (takes precedence)
   * @returns {Promise<Object[]>} Array of loaded templates
   */
  async extractAndLoadTemplates(taskDef, overrideTemplate = null) {
    const templates = [];

    // Priority 1: Override template from phase config
    if (overrideTemplate) {
      const content = await this.loadTemplate(overrideTemplate);
      if (content) {
        templates.push({ name: overrideTemplate, content });
      }
    }

    // Priority 2: Templates referenced in task frontmatter
    const frontmatterMatch = taskDef.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      try {
        const frontmatter = yaml.load(frontmatterMatch[1]);
        if (frontmatter?.templates) {
          for (const templateName of frontmatter.templates) {
            if (templateName !== overrideTemplate) {
              const content = await this.loadTemplate(templateName);
              if (content) {
                templates.push({ name: templateName, content });
              }
            }
          }
        }
      } catch (_e) {
        // Invalid YAML frontmatter - continue
      }
    }

    return templates;
  }

  /**
   * Load a single template file
   * @param {string} templateName - Template file name
   * @returns {Promise<string|null>} Template content or null
   */
  async loadTemplate(templateName) {
    const filePath = await this._resolveFrameworkFile(
      this.paths.templates,
      templateName,
      ['.yaml', '.yml', '.md'],
      'WORKFLOW_TEMPLATE_ID_INVALID',
    );
    if (filePath) return await fs.readFile(filePath, 'utf8');

    return null;
  }

  /**
   * Format context from previous phases
   * @param {Object} context - Execution context
   * @returns {string} Formatted context section
   */
  formatContextSection(context) {
    if (!context.previousPhases || Object.keys(context.previousPhases).length === 0) {
      return '(No previous phase outputs available)';
    }

    let section = '';
    for (const [phaseNum, phaseData] of Object.entries(context.previousPhases)) {
      section += `### Phase ${phaseNum}: ${phaseData.agent}\n`;
      section += `- Action: ${phaseData.action}\n`;
      if (phaseData.result?.output_path) {
        section += `- Output: ${phaseData.result.output_path}\n`;
      }
      if (phaseData.result?.summary) {
        section += `- Summary: ${phaseData.result.summary}\n`;
      }
      section += '\n';
    }

    return section;
  }

  /**
   * Assemble the final prompt from all components
   * @param {Object} components - All loaded components
   * @returns {string} Complete assembled prompt
   */
  assemblePrompt(components) {
    const {
      agentId,
      agentDef,
      taskFile,
      taskDef,
      checklists,
      templates,
      context,
      contextSection,
    } = components;

    let prompt = `# AGENT TRANSFORMATION

You are being activated as the **@${agentId}** agent.

## COMPLETE AGENT DEFINITION

The following is your COMPLETE agent definition. Adopt this persona fully.

---
${agentDef}
---

## TASK TO EXECUTE

**Task File:** ${taskFile}
**Expected Output:** ${context.creates || 'See task definition'}
**Execution Mode:** ${context.yoloMode ? 'YOLO (autonomous)' : 'Interactive'}
**Execution Profile:** ${context.executionProfile || 'balanced'}
**Elicitation Required:** ${context.elicit ? 'Yes' : 'No'}
**Risk Policy:** ${JSON.stringify(context.executionPolicy || {}, null, 0)}

### Complete Task Definition:

---
${taskDef}
---
`;

    if (context.notes) prompt += `\n## WORKFLOW STEP INSTRUCTIONS\n\n${context.notes}\n`;

    // Add checklists if available
    if (checklists.length > 0) {
      prompt += '\n## QUALITY CHECKLISTS\n\n';
      prompt += 'Execute these checklists to validate your work:\n\n';
      for (const checklist of checklists) {
        prompt += `### ${checklist.name}\n\n`;
        prompt += `---\n${checklist.content}\n---\n\n`;
      }
    }

    // Add templates if available
    if (templates.length > 0) {
      prompt += '\n## OUTPUT TEMPLATES\n\n';
      prompt += 'Use these templates as the basis for your output:\n\n';
      for (const template of templates) {
        prompt += `### ${template.name}\n\n`;
        prompt += `\`\`\`yaml\n${template.content}\n\`\`\`\n\n`;
      }
    }

    // Add context from previous phases
    prompt += '\n## CONTEXT FROM PREVIOUS PHASES\n\n';
    prompt += contextSection;

    // Add execution instructions
    prompt += `
## EXECUTION INSTRUCTIONS

1. **Adopt the persona completely** - Use the communication style and vocabulary defined
2. **Follow the task definition exactly** - Do not improvise or skip steps
3. **Use the templates provided** - They ensure consistency and quality
4. **Run the checklists** - Validate your work before marking complete
5. **Create the expected output** - Save to: ${context.creates || 'as specified in task'}

### Output Format

Return a structured result:

\`\`\`json
{
  "status": "success|failed",
  "output_path": "${context.creates || 'path/to/output'}",
  "summary": "Brief summary of what was accomplished",
  "findings": ["Key findings or items discovered"],
  "next_phase_context": {
    // Data relevant for the next phase
  }
}
\`\`\`
`;

    return prompt;
  }
}

module.exports = SubagentPromptBuilder;
