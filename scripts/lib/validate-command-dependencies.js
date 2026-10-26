'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const isMap = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const FILE_REF = /^(.*\.(?:md|ya?ml|[cm]?js|json))(?:#([^\s#]+))?$/;

function sectionSlugs(text) {
  const slugs = [];
  let fence;
  for (const line of text.split(/\r?\n/)) {
    const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = undefined;
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) slugs.push(heading[1].toLowerCase()
      .replace(/[^\p{L}\p{N}_\-\s]/gu, '').trim().replace(/\s/g, '-'));
  }
  return slugs;
}

/** Validate declared command inputs, not arbitrary filenames in explanatory prose. */
function validateCommandDependencies(squadPath, squadName, repoRoot) {
  const errors = [];
  const agentsDir = path.join(squadPath, 'agents');
  if (!fs.existsSync(agentsDir)) return errors;
  for (const name of fs.readdirSync(agentsDir).filter(file => file.endsWith('.md'))) {
    const file = `${squadName}/agents/${name}`;
    const fail = (location, message) => errors.push({
      code: 'COMMAND_DEPENDENCY_INVALID', file, message: `${location}: ${message}`,
    });
    let text;
    let data;
    try {
      text = fs.readFileSync(path.join(agentsDir, name), 'utf8');
      const block = text.match(/^```yaml\r?\n([\s\S]*?)^```/m);
      if (!block) throw new Error('missing fenced agent YAML');
      data = yaml.load(block[1]);
      if (!isMap(data)) throw new Error('expected agent mapping');
    } catch (error) {
      fail('YAML', error.reason || error.message);
      continue;
    }
    const check = (input, location, kind = 'tasks', requiredFile = false) => {
      if (typeof input !== 'string' || !input.trim()) {
        fail(location, 'expected a nonempty reference or prerequisite string');
        return;
      }
      const ref = input.replace(/\s+#.*$/, '').trim();
      const match = ref.match(FILE_REF);
      if (!match) {
        if (requiredFile || /^(?:squads\/|tasks\/|config\/|workflows\/|\.\.?\/)/.test(ref)) {
          fail(location, `malformed file reference ${ref}`);
        }
        return; // Tool names, symbolic BR IDs and prose prerequisites are not files.
      }
      const [, target, anchor] = match;
      if (anchor && location.startsWith('direct-Read')) {
        fail(location, 'Read must receive the base filename; select the section after reading');
        return;
      }
      const candidates = target.includes('/') || target.includes('\\')
        ? [path.resolve(repoRoot, target), path.resolve(squadPath, target)]
        : [kind, 'tasks', 'templates', 'checklists', 'data', 'config', 'workflows']
          .flatMap(dir => [path.join(squadPath, dir, target),
            path.join(repoRoot, '.aexos-core', 'development', dir, target)]);
      const resolved = candidates.find(candidate => {
        try { return fs.statSync(candidate).isFile(); } catch { return false; }
      });
      if (!resolved) {
        fail(location, `required file ${ref} does not exist or is not a regular file`);
      } else if (anchor) {
        // Section references are content contracts; consumers still read the base file.
        const matches = sectionSlugs(fs.readFileSync(resolved, 'utf8')).filter(slug => slug === anchor).length;
        if (matches === 0) fail(location, `required section #${anchor} not found in ${target}`);
        else if (matches !== 1) fail(location, `required section #${anchor} is ambiguous in ${target}`);
      }
    };
    const checkDeclared = (value, location, kind) => {
      if (typeof value === 'string') check(value, location, kind);
      else if (Array.isArray(value)) value.forEach((entry, index) => check(entry, `${location}[${index}]`, kind));
      else if (isMap(value)) {
        for (const [group, list] of Object.entries(value)) {
          if (!Array.isArray(list) && typeof list !== 'string') {
            fail(`${location}.${group}`, 'expected a reference string or array');
          } else checkDeclared(list, `${location}.${group}`, group);
        }
      } else fail(location, 'expected reference string, array or dependency groups');
    };
    const walkCommands = (value, location, command, ancestors = new Set()) => {
      if (!isMap(value) && !Array.isArray(value)) {
        return;
      }
      if (ancestors.has(value)) {
        fail(location, 'cyclic command definition');
        return;
      }
      const next = new Set(ancestors).add(value);
      if (Array.isArray(value)) {
        value.forEach((entry, index) => walkCommands(entry, `${location}[${index}]`, command, next));
        return;
      }
      const identity = value.syntax || value.name || command;
      for (const [key, child] of Object.entries(value)) {
        const where = `${location}.${key}${identity ? ` (${identity})` : ''}`;
        if (['dependencies', 'dependency', 'requires'].includes(key)) {
          checkDeclared(child, where);
        } else if (key === 'loader' && child !== null) {
          check(child, where, 'tasks', true);
        } else if (isMap(child) || Array.isArray(child)) {
          walkCommands(child, `${location}.${key}`, key.startsWith('*') ? key : identity, next);
        }
      }
    };
    const discover = (value, location = '', ancestors = new Set()) => {
      if (!isMap(value) && !Array.isArray(value)) return;
      if (ancestors.has(value)) {
        fail(location, 'cyclic agent definition');
        return;
      }
      const next = new Set(ancestors).add(value);
      for (const [key, child] of Object.entries(value)) {
        const where = location ? `${location}.${key}` : key;
        if (['commands', 'command_loader'].includes(key)) {
          if (!isMap(child) && !Array.isArray(child)) fail(where, 'expected a command map or array');
          else {
            if (Array.isArray(child) && !child.every(entry => isMap(entry) ||
                (typeof entry === 'string' && entry.trim()))) {
              fail(where, 'expected command definition mappings or command descriptions');
            }
            walkCommands(child, where);
          }
        } else discover(child, where, next);
      }
    };
    discover(data);

    // Only explicit command -> Read(...) lines in loading instructions. Blank-line
    // continuations are supported; examples without a command prefix are ignored.
    for (const match of text.matchAll(/^[ \t]*(\*[a-z][a-z0-9-]*)[ \t]*(?:→|->)[ \t]*(?:\r?\n[ \t]*)*Read\b/gm)) {
      const argument = text.slice(match.index + match[0].length).match(/^\(\s*(["'])([^"'\r\n]+)\1\s*\)/);
      if (!argument) fail(`direct-Read ${match[1]}`, 'expected exactly one quoted file reference');
      else check(argument[2], `direct-Read ${match[1]}`, 'tasks', true);
    }
  }
  return errors;
}

module.exports = { validateCommandDependencies };
