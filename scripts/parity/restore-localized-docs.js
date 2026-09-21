#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SOURCE_COMMIT = '4ef6530ff03b83aea953e4a426f95e012b8b70c5';
const SOURCE_REPOSITORY = 'https://github.com/SynkraAI/aiox-core';
const IMPLEMENTATION_REPOSITORY = 'https://github.com/CyryxLabs/aexos-engine';
const LANGUAGES = ['en', 'es', 'pt', 'zh'];

const BLOCK_RULES = [
  {
    id: 'upstream-private-squads-api',
    pattern: /https:\/\/(?:api\.)?synkra\.ai\//i,
    reason:
      'No verified AEXOS endpoint or API-key issuer exists for the upstream private Squads API.',
  },
  {
    id: 'upstream-private-pro-runtime',
    pattern: /\baiox-pro\b/i,
    reason:
      'The document depends on inaccessible upstream aiox-pro behavior and cannot be relabeled as AEXOS behavior.',
  },
  {
    id: 'unverified-security-contact',
    pattern: /security@synkra\.ai/i,
    reason:
      'No verified Cyryx security-reporting address was available; retaining the upstream address as AEXOS support would be misleading.',
  },
  {
    id: 'unavailable-upstream-diagnostic-download',
    pattern:
      /raw\.githubusercontent\.com\/SynkraAI\/aiox-core\/main\/tools\/(?:quick-diagnose|diagnose-installation)/i,
    reason:
      'The document downloads and executes upstream diagnostic scripts that do not exist at the mapped AEXOS paths.',
  },
  {
    id: 'unresolved-upstream-submodule-install',
    pattern: /git\s+submodule\s+add\s+https:\/\/github\.com\/SynkraAI\//i,
    reason:
      'The setup procedure installs upstream Synkra repositories with no verified AEXOS-owned destination mapping.',
  },
];

const PRE_URL_RULES = [
  [
    'malformed-core-repository-url',
    /https:\/\/github\.com\/SynkraAIinc\/@synkra\/aiox-core/gi,
    IMPLEMENTATION_REPOSITORY,
  ],
  [
    'core-repository-url',
    /https:\/\/github\.com\/(?:SynkraAI|SynkraAIinc|aiox-core)\/aiox-core/gi,
    IMPLEMENTATION_REPOSITORY,
  ],
  [
    'fork-repository-url',
    /https:\/\/github\.com\/(YOUR_USERNAME|SEU[_-]USUARIO)\/aiox-core/gi,
    (_match, account) => `https://github.com/${account}/aexos-engine`,
  ],
  [
    'malformed-fork-repository-url',
    /https:\/\/github\.com\/(YOUR-USERNAME)\/@synkra\/aiox-core/gi,
    (_match, account) => `https://github.com/${account}/aexos-engine`,
  ],
  [
    'npm-registry-package-url',
    /https:\/\/registry\.npmjs\.org\/@synkra\/aiox-core/gi,
    'https://registry.npmjs.org/@aexos/core',
  ],
  [
    'upstream-discord-support',
    /\[[^\]]+\]\(https:\/\/discord\.gg\/gk8jAdXWmj\)/gi,
    '[Cyryx support](https://cyryxlabs.com/contact)',
  ],
  ['upstream-docs-site', /https:\/\/aiox-core\.dev(?:\/[^\s)>"']*)?/gi, IMPLEMENTATION_REPOSITORY],
  [
    'upstream-social-account',
    /\[@aioxfullstack\]\(https:\/\/twitter\.com\/aioxfullstack\)/gi,
    '[Cyryx support](https://cyryxlabs.com/contact)',
  ],
];

const TEXT_RULES = [
  ['scoped-package', /@(?:synkra\/aiox-core|aiox\/core)\b/gi, '@aexos/core'],
  ['npx-package', /\bnpx\s+aiox-core\b/gi, 'npx @aexos/core'],
  ['core-directory', /\.aiox-core\b/g, '.aexos-core'],
  ['legacy-config-directory', /\.aiox(?=\/|\\|\b)/g, '.aexos'],
  ['core-package-name', /\baiox-core\b/gi, 'aexos-core'],
  ['agent-flow-path', /aiox-agent-flows/gi, 'aexos-agent-flows'],
  ['workflow-path', /aiox-workflows/gi, 'aexos-workflows'],
  ['master-file-path', /aiox-master-system/gi, 'aexos-master-system'],
  ['master-agent-id', /@aiox-master\b/gi, '@aexos-master'],
  ['claude-command-namespace', /\.claude\/commands\/AIOX\b/g, '.claude/commands/AEXOS'],
  ['environment-prefix', /\bAIOX_/g, 'AEXOS_'],
  ['storage-namespace', /\baiox-projects\b/g, 'aexos-projects'],
  ['product-brand', /\bSynkra\s+AIOX\b/g, 'AEXOS (Cyryx)'],
  ['company-name', /\bSynkraAI\b/g, 'Cyryx Labs'],
  ['company-short-name', /\bSynkra\b/g, 'Cyryx Labs'],
  ['product-acronym', /AIOX/g, 'AEXOS'],
  ['product-code-prefix', /Aiox(?=[A-Z])/g, 'Aexos'],
  ['product-titlecase', /\bAiox\b/g, 'Aexos'],
  ['product-lowercase', /\baiox\b/g, 'aexos'],
];

const LIMITED_FALLBACK_COPY = {
  es: {
    'upstream-private-squads-api': {
      title: 'Interfaz pública de Squads',
      intro:
        'AEXOS no publica en este repositorio un endpoint alojado de Squads ni un emisor de claves API verificado.',
      available:
        'La interfaz pública disponible es local: carga y valida manifiestos de squads dentro del proyecto.',
      unavailable:
        'El endpoint privado y el flujo de claves descritos por el documento de origen no están disponibles y no deben reutilizarse.',
    },
    'unresolved-upstream-submodule-install': {
      title: 'Estrategia multi-repositorio',
      intro:
        'El procedimiento de origen instala repositorios de Synkra sin un destino AEXOS verificado.',
      available: 'Use el repositorio actual y los squads locales documentados por AEXOS.',
      unavailable:
        'No hay un mapeo verificado para esos submódulos; por eso esta guía no proporciona comandos de instalación sustitutivos.',
    },
    'unavailable-upstream-diagnostic-download': {
      title: 'Solución de problemas de instalación',
      intro:
        'Las descargas de diagnóstico del documento de origen no existen en una ubicación AEXOS verificada.',
      available:
        'Use los comandos incluidos en el paquete instalado: `aexos --help` y `aexos doctor`.',
      unavailable: 'No descargue ni ejecute scripts desde las URL del documento de origen.',
    },
  },
  pt: {
    'upstream-private-squads-api': {
      title: 'Interface pública de Squads',
      intro:
        'O AEXOS não publica neste repositório um endpoint hospedado de Squads nem um emissor verificado de chaves de API.',
      available:
        'A interface pública disponível é local: ela carrega e valida manifestos de squads dentro do projeto.',
      unavailable:
        'O endpoint privado e o fluxo de chaves descritos pelo documento de origem não estão disponíveis e não devem ser reutilizados.',
    },
    'unresolved-upstream-submodule-install': {
      title: 'Estratégia de múltiplos repositórios',
      intro:
        'O procedimento de origem instala repositórios da Synkra sem um destino AEXOS verificado.',
      available: 'Use o repositório atual e os squads locais documentados pelo AEXOS.',
      unavailable:
        'Não há mapeamento verificado para esses submódulos; por isso este guia não fornece comandos de instalação substitutos.',
    },
    'unavailable-upstream-diagnostic-download': {
      title: 'Solução de problemas de instalação',
      intro:
        'Os downloads de diagnóstico do documento de origem não existem em uma localização AEXOS verificada.',
      available: 'Use os comandos incluídos no pacote instalado: `aexos --help` e `aexos doctor`.',
      unavailable: 'Não baixe nem execute scripts usando as URLs do documento de origem.',
    },
  },
  zh: {
    'upstream-private-squads-api': {
      title: 'Squads 公共接口',
      intro: '此仓库未提供经过验证的 AEXOS 托管 Squads 端点或 API 密钥签发服务。',
      available: '当前可用的公共接口是本地接口，用于加载并验证项目内的 squad 清单。',
      unavailable: '源文档中的私有端点和密钥流程不可用，不应重复使用。',
    },
    'unavailable-upstream-diagnostic-download': {
      title: '安装故障排除',
      intro: '源文档引用的诊断下载在经过验证的 AEXOS 位置中不存在。',
      available: '请使用已安装软件包提供的命令：`aexos --help` 和 `aexos doctor`。',
      unavailable: '请勿从源文档中的 URL 下载或执行脚本。',
    },
    'upstream-private-pro-runtime': {
      title: '内存系统可用性说明',
      intro: '源文档依赖无法访问的私有 Pro 运行时，因此不能将其描述为此开源仓库中可执行的功能。',
      available: '公开的 Core/Pro 扩展边界仍保留；当前核心内存行为请参阅本地内存系统文档。',
      unavailable: '私有运行时的实现、安装和运行行为不在此仓库中，也未在本次恢复中验证。',
    },
    'unverified-security-contact': {
      title: '安全报告说明',
      intro: '源文档中的安全邮箱属于上游项目，不能作为 AEXOS 联系方式重新标记。',
      available: '请使用此仓库规范安全政策中列出的当前报告渠道。',
      unavailable: '此本地化页面不会虚构电子邮件地址或响应承诺。',
    },
  },
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function listFiles(root) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute);
    }
  }
  if (fs.existsSync(root)) visit(root);
  return files.sort((a, b) => a.localeCompare(b));
}

function destinationPath(sourceRelative) {
  return sourceRelative
    .replace(/aiox-agent-flows/gi, 'aexos-agent-flows')
    .replace(/aiox-workflows/gi, 'aexos-workflows')
    .replace(/aiox-master-system/gi, 'aexos-master-system')
    .replace(/aiox/g, 'aexos')
    .replace(/AIOX/g, 'AEXOS');
}

function classifyBlocker(content) {
  const matches = BLOCK_RULES.filter((rule) => rule.pattern.test(content));
  return matches.map(({ id, reason }) => ({ id, reason }));
}

function protectExternalUrls(content) {
  const values = [];
  const references = [];
  let protectedContent = content.replace(
    /\[[^\]]+\]\(https?:\/\/github\.com\/SynkraAI\/(?!aiox-core\b)[^)]+\)/gi,
    (reference) => {
      references.push(reference);
      return `__AEXOS_EXTERNAL_REFERENCE_${references.length - 1}__`;
    },
  );
  protectedContent = protectedContent.replace(/https?:\/\/[^\s)>"']+/g, (url) => {
    values.push(url);
    return `__AEXOS_EXTERNAL_URL_${values.length - 1}__`;
  });
  return {
    content: protectedContent,
    restore(value) {
      return value
        .replace(/__AEXOS_EXTERNAL_URL_(\d+)__/g, (_match, index) => values[Number(index)])
        .replace(
          /__AEXOS_EXTERNAL_REFERENCE_(\d+)__/g,
          (_match, index) => references[Number(index)],
        );
    },
    urls: [...values, ...references.map((reference) => reference.match(/https?:\/\/[^)]+/)[0])],
  };
}

function transformContent(content, sourceRelative) {
  let transformed = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const counts = {};

  if (/^docs\/(?:es|pt)\/guides\/user-guide\.md$/.test(sourceRelative)) {
    let count = 0;
    transformed = transformed.replace(/\.\.\/\.\.\/architecture\/multi-repo-strategy\.md/g, () => {
      count += 1;
      return '../architecture/multi-repo-strategy.md';
    });
    if (count) counts['localized-navigation-path'] = count;
  }

  // Product-owned destinations are mapped before protecting third-party URLs.
  for (const [id, pattern, replacement] of PRE_URL_RULES) {
    let count = 0;
    transformed = transformed.replace(pattern, (...args) => {
      count += 1;
      return typeof replacement === 'function' ? replacement(...args) : replacement;
    });
    if (count) counts[id] = count;
  }

  const protectedUrls = protectExternalUrls(transformed);
  transformed = protectedUrls.content;

  for (const [id, pattern, replacement] of TEXT_RULES) {
    let count = 0;
    transformed = transformed.replace(pattern, () => {
      count += 1;
      return replacement;
    });
    if (count) counts[id] = count;
  }
  transformed = protectedUrls.restore(transformed);

  const sourceUrl = `${SOURCE_REPOSITORY}/blob/${SOURCE_COMMIT}/${sourceRelative.replace(/\\/g, '/')}`;
  const licenseUrl = `${SOURCE_REPOSITORY}/blob/${SOURCE_COMMIT}/LICENSE`;
  const header = [
    '<!--',
    `  AEXOS localization provenance: adapted from ${sourceUrl}`,
    `  Upstream localized content retained under the MIT license: ${licenseUrl}`,
    '  Status: adapted for AEXOS identity and paths; not behaviorally verified.',
    '-->',
    '',
  ].join('\n');

  return {
    content: `${header}${transformed.replace(/^\n+/, '')}`.replace(/\n*$/, '\n'),
    transformations: counts,
    retainedExternalUrls: protectedUrls.urls
      .filter((url) => /github\.com\/SynkraAI\//i.test(url))
      .sort(),
  };
}

function renderLimitedFallback(
  sourceContent,
  sourceRelative,
  destinationRelative,
  blockers,
) {
  const language = destinationRelative.split('/')[1];
  const blocker = blockers[0];
  const copy = LIMITED_FALLBACK_COPY[language]?.[blocker.id];
  if (!copy || blockers.length !== 1) {
    throw new Error(`Missing bounded localized fallback for ${destinationRelative}`);
  }
  const unsafeOperations = {
    'upstream-private-squads-api': {
      pattern: /https:\/\/(?:api\.)?synkra\.ai(?:\/[^\s)>"'`]*)?/gi,
      marker: 'AEXOS_HOSTED_SQUADS_ENDPOINT_UNAVAILABLE',
    },
    'unresolved-upstream-submodule-install': {
      pattern: /https:\/\/github\.com\/SynkraAI\/[^\s)>"'`]*/gi,
      marker: 'UPSTREAM_SUBMODULE_REPOSITORY_UNAVAILABLE',
    },
    'unavailable-upstream-diagnostic-download': {
      pattern:
        /https:\/\/raw\.githubusercontent\.com\/SynkraAI\/aiox-core\/main\/tools\/(?:quick-diagnose|diagnose-installation)[^\s)>"'`]*/gi,
      marker: 'UPSTREAM_DIAGNOSTIC_DOWNLOAD_UNAVAILABLE',
    },
    'upstream-private-pro-runtime': {
      pattern: /\baiox-pro\b/gi,
      marker: 'AEXOS_PRO_PRIVATE_RUNTIME_UNAVAILABLE',
    },
    'unverified-security-contact': {
      pattern: /security@synkra\.ai/gi,
      marker: 'UPSTREAM_SECURITY_CONTACT_UNAVAILABLE',
    },
  }[blocker.id];
  let replacements = 0;
  const neutralized = sourceContent.replace(unsafeOperations.pattern, () => {
    replacements += 1;
    return unsafeOperations.marker;
  });
  if (replacements === 0) {
    throw new Error(`Failed to annotate unsupported operation in ${sourceRelative}`);
  }

  const transformed = transformContent(neutralized, sourceRelative);
  transformed.transformations[`annotated-${blocker.id}`] = replacements;
  const linkReplacements = {
    'docs/es/architecture/multi-repo-strategy.md': [
      ['../../architecture/multi-repo-strategy.md', '../../zh/architecture/multi-repo-strategy.md'],
      ['../migration/migration-guide.md', '../migration-guide.md'],
    ],
    'docs/pt/architecture/multi-repo-strategy.md': [
      ['../architecture/multi-repo-strategy.md', '../../zh/architecture/multi-repo-strategy.md'],
      ['../es/architecture/multi-repo-strategy.md', '../../es/architecture/multi-repo-strategy.md'],
      ['../migration/migration-guide.md', '../migration-guide.md'],
    ],
    'docs/zh/api/squads-api.md': [
      ['../guides/squads-guide.md', '../../guides/squads-guide.md'],
    ],
    'docs/zh/guides/security-hardening.md': [
      ['../pt/guides/security-hardening.md', '../../pt/guides/security-hardening.md'],
      ['../es/guides/security-hardening.md', '../../es/guides/security-hardening.md'],
    ],
    'docs/zh/security.md': [['../SECURITY-PT.md', '../pt/security.md']],
  }[destinationRelative] || [];
  for (const [from, to] of linkReplacements) {
    if (transformed.content.includes(from)) {
      transformed.content = transformed.content.replaceAll(from, to);
      transformed.transformations['reconciled-local-links'] =
        (transformed.transformations['reconciled-local-links'] || 0) + 1;
    }
  }
  if (destinationRelative === 'docs/zh/guides/MEMORY-INTELLIGENCE-SYSTEM.md') {
    const unavailableReferencePattern =
      /\[([^\]]+)\]\((?:\.\.\/stories\/|\.\.\/architecture\/adr\/|\.\.\/\.\.\/pro\/)[^)]+\)/g;
    const unavailableReferenceCount = [
      ...transformed.content.matchAll(unavailableReferencePattern),
    ].length;
    transformed.content = transformed.content
      .replaceAll('../../bin/utils/pro-detector.js', '../../../bin/utils/pro-detector.js')
      .replace(
        unavailableReferencePattern,
        '$1 (`UPSTREAM_REFERENCE_UNAVAILABLE`)',
      );
    transformed.transformations['annotated-unavailable-local-references'] =
      unavailableReferenceCount;
  }
  const boundary = [
    `> **${copy.title} — availability boundary**`,
    '>',
    `> ${copy.intro}`,
    '>',
    `> **Portable content retained:** ${copy.available}`,
    '>',
    `> **Unsupported prerequisite:** ${copy.unavailable}`,
    '',
  ].join('\n');
  const limitedStatus =
    '  Status: portable sections retained; unsupported prerequisites annotated; not behaviorally verified.';
  transformed.content = transformed.content
    .replace(
      '  Status: adapted for AEXOS identity and paths; not behaviorally verified.',
      limitedStatus,
    )
    .replace(`${limitedStatus}\n-->\n`, `${limitedStatus}\n-->\n\n${boundary}`);
  return transformed;
}

function parseArgs(argv) {
  const args = {
    outputRoot: path.resolve(__dirname, '..', '..'),
    upstreamRoot: path.resolve(__dirname, '..', '..', '..', 'upstream'),
    check: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--check') args.check = true;
    else if (argv[index] === '--output-root') args.outputRoot = path.resolve(argv[++index]);
    else if (argv[index] === '--upstream-root') args.upstreamRoot = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return args;
}

function restoreLocalizedDocs(options) {
  const actualCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: options.upstreamRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (actualCommit !== SOURCE_COMMIT) {
    throw new Error(
      `Upstream checkout mismatch: expected ${SOURCE_COMMIT}, received ${actualCommit}`,
    );
  }

  const provenancePath = path.join(
    options.outputRoot,
    'docs',
    'parity',
    'localization-provenance.json',
  );
  let priorOutputs = new Map();
  if (fs.existsSync(provenancePath)) {
    const prior = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
    priorOutputs = new Map(
      [...(prior.entries || []), ...(prior.supplemental_entries || [])]
        .filter((entry) => entry.output_sha256)
        .map((entry) => [entry.destination, entry.output_sha256]),
    );
  }

  const entries = [];
  const seenDestinations = new Set();
  const sourceDocsRoot = path.join(options.upstreamRoot, 'docs');

  for (const language of LANGUAGES) {
    for (const sourcePath of listFiles(path.join(sourceDocsRoot, language))) {
      const sourceRelative = path.relative(options.upstreamRoot, sourcePath).replace(/\\/g, '/');
      const destinationRelative = destinationPath(sourceRelative);
      if (seenDestinations.has(destinationRelative)) {
        throw new Error(`Duplicate localized destination: ${destinationRelative}`);
      }
      seenDestinations.add(destinationRelative);

      const sourceContent = fs.readFileSync(sourcePath, 'utf8');
      const destination = path.join(options.outputRoot, destinationRelative);
      const blockers = classifyBlocker(sourceContent);
      const baseEntry = {
        source: sourceRelative,
        destination: destinationRelative,
        source_sha256: sha256(sourceContent),
        source_commit: SOURCE_COMMIT,
      };

      if (blockers.length) {
        const transformed = renderLimitedFallback(
          sourceContent,
          sourceRelative,
          destinationRelative,
          blockers,
        );
        const content = transformed.content;
        if (fs.existsSync(destination)) {
          const current = fs.readFileSync(destination, 'utf8').replace(/\r\n/g, '\n');
          if (current !== content) {
            const priorHash = priorOutputs.get(destinationRelative);
            if (!priorHash || sha256(current) !== priorHash) {
              throw new Error(
                `Refusing to overwrite modified bounded fallback: ${destinationRelative}`,
              );
            }
            if (options.check)
              throw new Error(`Stale bounded localized fallback: ${destinationRelative}`);
            fs.writeFileSync(destination, content, 'utf8');
          }
        } else if (options.check) {
          throw new Error(`Missing bounded localized fallback: ${destinationRelative}`);
        } else {
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.writeFileSync(destination, content, 'utf8');
        }
        entries.push({
          ...baseEntry,
          output_sha256: sha256(content),
          status: 'ADAPTED_WITH_EXPLICIT_LIMITATIONS',
          behavioral_verification: 'NOT_PERFORMED',
          limitations: blockers,
          content_recovery: 'PORTABLE_SECTIONS_RETAINED_UNSUPPORTED_OPERATIONS_ANNOTATED',
          source_line_count: sourceContent.split('\n').length,
          output_line_count: content.split('\n').length,
          transformations: transformed.transformations,
          retained_external_source_references: transformed.retainedExternalUrls,
        });
        continue;
      }

      const transformed = transformContent(sourceContent, sourceRelative);
      if (fs.existsSync(destination)) {
        const current = fs.readFileSync(destination, 'utf8').replace(/\r\n/g, '\n');
        if (current !== transformed.content) {
          const priorHash = priorOutputs.get(destinationRelative);
          if (!priorHash || sha256(current) !== priorHash) {
            throw new Error(
              `Refusing to overwrite non-generated or modified document: ${destinationRelative}`,
            );
          }
          if (options.check) {
            throw new Error(`Stale restored localized document: ${destinationRelative}`);
          }
          fs.writeFileSync(destination, transformed.content, 'utf8');
        }
      } else if (options.check) {
        throw new Error(`Missing restored localized document: ${destinationRelative}`);
      } else {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, transformed.content, 'utf8');
      }

      entries.push({
        ...baseEntry,
        output_sha256: sha256(transformed.content),
        status: 'ADAPTED_NOT_BEHAVIORALLY_VERIFIED',
        behavioral_verification: 'NOT_PERFORMED',
        transformations: transformed.transformations,
        retained_external_source_references: transformed.retainedExternalUrls,
      });
    }
  }

  const supplementalEntries = [];
  const supplementalSourceRelative = 'docs/guides/IDS-CONCEITOS-EXPLICADOS.md';
  const supplementalSource = path.join(options.upstreamRoot, supplementalSourceRelative);
  const supplementalDestinationRelative = supplementalSourceRelative;
  const supplementalDestination = path.join(options.outputRoot, supplementalDestinationRelative);
  const supplementalSourceContent = fs.readFileSync(supplementalSource, 'utf8');
  const supplementalTransformed = transformContent(
    supplementalSourceContent,
    supplementalSourceRelative,
  );
  const unsupportedIdsCommands = [
    '# Backup do registry',
    'aexos ids:backup',
    '',
    '# Forçar sync completo',
    'aexos ids:sync',
  ].join('\n');
  const supportedIdsCommands = [
    '# Verificar a decisão antes de criar',
    'aexos ids:check "validar schema yaml" --type task',
    '',
    '# Analisar o impacto de uma alteração',
    'aexos ids:impact create-story',
    '',
    '# Registrar um artefato criado',
    'aexos ids:register .aexos-core/development/tasks/minha-tarefa.md',
  ].join('\n');
  if (!supplementalTransformed.content.includes(unsupportedIdsCommands)) {
    throw new Error(
      'Portuguese IDS command section no longer matches the pinned source adaptation.',
    );
  }
  supplementalTransformed.content = supplementalTransformed.content.replace(
    unsupportedIdsCommands,
    supportedIdsCommands,
  );
  supplementalTransformed.transformations['runtime-command-reconciliation'] = 2;
  if (fs.existsSync(supplementalDestination)) {
    const current = fs.readFileSync(supplementalDestination, 'utf8').replace(/\r\n/g, '\n');
    if (current !== supplementalTransformed.content) {
      const priorHash = priorOutputs.get(supplementalDestinationRelative);
      if (!priorHash || sha256(current) !== priorHash) {
        throw new Error(
          `Refusing to overwrite modified supplemental guide: ${supplementalDestinationRelative}`,
        );
      }
      if (options.check)
        throw new Error(`Stale supplemental localized guide: ${supplementalDestinationRelative}`);
      fs.writeFileSync(supplementalDestination, supplementalTransformed.content, 'utf8');
    }
  } else if (options.check) {
    throw new Error(`Missing supplemental localized guide: ${supplementalDestinationRelative}`);
  } else {
    fs.mkdirSync(path.dirname(supplementalDestination), { recursive: true });
    fs.writeFileSync(supplementalDestination, supplementalTransformed.content, 'utf8');
  }
  supplementalEntries.push({
    source: supplementalSourceRelative,
    destination: supplementalDestinationRelative,
    source_sha256: sha256(supplementalSourceContent),
    source_commit: SOURCE_COMMIT,
    output_sha256: sha256(supplementalTransformed.content),
    status: 'ADAPTED_NOT_BEHAVIORALLY_VERIFIED',
    behavioral_verification: 'NOT_PERFORMED',
    transformations: supplementalTransformed.transformations,
    retained_external_source_references: supplementalTransformed.retainedExternalUrls,
  });

  const provenance = {
    schema_version: 1,
    source: { repository: SOURCE_REPOSITORY, commit: SOURCE_COMMIT, license: 'MIT' },
    policy: {
      generated_docs_are_behaviorally_verified: false,
      generated_docs_are_updated_only_when_prior_hash_matches: true,
      external_provider_identifiers_are_preserved: true,
      unresolved_private_service_mappings_are_documented_as_unavailable: true,
      inaccessible_private_pro_content_is_excluded: true,
      limited_adaptations_remain_pending_capabilities: true,
    },
    summary: {
      upstream_localized_documents: entries.length,
      adapted_not_behaviorally_verified: entries.filter(
        (entry) => entry.status === 'ADAPTED_NOT_BEHAVIORALLY_VERIFIED',
      ).length,
      adapted_with_explicit_limitations: entries.filter(
        (entry) => entry.status === 'ADAPTED_WITH_EXPLICIT_LIMITATIONS',
      ).length,
      blocked_not_restored: entries.filter((entry) => entry.status.startsWith('BLOCKED')).length,
      supplemental_canonical_adaptations: supplementalEntries.length,
    },
    entries,
    supplemental_entries: supplementalEntries,
  };
  const provenanceContent = `${JSON.stringify(provenance, null, 2)}\n`;
  if (options.check) {
    if (!fs.existsSync(provenancePath)) throw new Error('Missing localization provenance file.');
    const current = fs.readFileSync(provenancePath, 'utf8').replace(/\r\n/g, '\n');
    if (current !== provenanceContent) throw new Error('Localization provenance is stale.');
  } else {
    fs.mkdirSync(path.dirname(provenancePath), { recursive: true });
    fs.writeFileSync(provenancePath, provenanceContent, 'utf8');
  }

  return provenance;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const provenance = restoreLocalizedDocs(options);
  process.stdout.write(`${JSON.stringify(provenance.summary)}\n`);
}

if (require.main === module) main();

module.exports = {
  BLOCK_RULES,
  IMPLEMENTATION_REPOSITORY,
  SOURCE_COMMIT,
  SOURCE_REPOSITORY,
  classifyBlocker,
  destinationPath,
  restoreLocalizedDocs,
  transformContent,
  renderLimitedFallback,
};
