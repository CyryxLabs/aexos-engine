const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  TemplateEngine,
} = require('../../.aexos-core/product/templates/engine');

const packageTemplatesDir = path.resolve(
  __dirname,
  '../../.aexos-core/product/templates',
);

describe('installed template resolution', () => {
  let consumerRoot;

  beforeEach(() => {
    consumerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-template-consumer-'));
  });

  afterEach(() => {
    fs.rmSync(consumerRoot, { recursive: true, force: true });
  });

  test('empty consumers load the packaged template and its real schema', async () => {
    const engine = new TemplateEngine({ baseDir: consumerRoot, interactive: false });

    const template = await engine.loader.load('adr');
    const schema = await engine.validator.loadSchema('adr');
    const availableTemplates = await engine.loader.listTemplates();

    expect(template.path).toBe(path.join(packageTemplatesDir, 'adr.hbs'));
    expect(template.metadata.template_name).toBe('Architecture Decision Record');
    expect(schema.title).toBe('ADR Template Variables');
    expect(schema.required).toContain('decision');
    expect(availableTemplates).toContain('adr');
  });

  test('a consumer template overrides the packaged template', async () => {
    const consumerTemplatesDir = path.join(
      consumerRoot,
      '.aexos-core',
      'product',
      'templates',
    );
    fs.mkdirSync(consumerTemplatesDir, { recursive: true });
    fs.writeFileSync(path.join(consumerTemplatesDir, 'adr.hbs'), `---
template_id: adr
template_name: Consumer ADR
version: 9.0
variables: []
---
# Consumer ADR
`);

    const engine = new TemplateEngine({ baseDir: consumerRoot, interactive: false });
    const template = await engine.loader.load('adr');
    const availableTemplates = await engine.loader.listTemplates();

    expect(template.path).toBe(path.join(consumerTemplatesDir, 'adr.hbs'));
    expect(template.metadata.template_name).toBe('Consumer ADR');
    expect(template.body).toBe('# Consumer ADR');
    expect(availableTemplates.filter(name => name === 'adr')).toHaveLength(1);
  });

  test('an invalid consumer template is reported instead of hidden by fallback', async () => {
    const consumerTemplatesDir = path.join(
      consumerRoot,
      '.aexos-core',
      'product',
      'templates',
    );
    fs.mkdirSync(consumerTemplatesDir, { recursive: true });
    fs.writeFileSync(path.join(consumerTemplatesDir, 'adr.hbs'), 'invalid consumer template');

    const engine = new TemplateEngine({ baseDir: consumerRoot, interactive: false });

    await expect(engine.getTemplateInfo('adr')).rejects.toThrow(
      'Invalid template format: missing YAML frontmatter',
    );
  });

  test('an invalid consumer schema is reported instead of hidden by fallback', async () => {
    const consumerSchemasDir = path.join(
      consumerRoot,
      '.aexos-core',
      'product',
      'templates',
      'engine',
      'schemas',
    );
    fs.mkdirSync(consumerSchemasDir, { recursive: true });
    fs.writeFileSync(path.join(consumerSchemasDir, 'adr.schema.json'), '{ invalid json');

    const engine = new TemplateEngine({ baseDir: consumerRoot, interactive: false });

    await expect(engine.validator.loadSchema('adr')).rejects.toThrow(
      'Failed to load schema for adr',
    );
  });

  test('an unreadable declared consumer path is not treated as absent', async () => {
    const engine = new TemplateEngine({ baseDir: consumerRoot, interactive: false });
    const primaryTemplatePath = path.join(
      consumerRoot,
      '.aexos-core',
      'product',
      'templates',
      'adr.hbs',
    );
    const primarySchemaPath = path.join(
      consumerRoot,
      '.aexos-core',
      'product',
      'templates',
      'engine',
      'schemas',
      'adr.schema.json',
    );
    const originalLstat = fs.lstatSync;
    const accessError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const lstatSpy = jest.spyOn(fs, 'lstatSync').mockImplementation(filePath => {
      if (filePath === primaryTemplatePath || filePath === primarySchemaPath) throw accessError;
      return originalLstat(filePath);
    });

    try {
      await expect(engine.getTemplateInfo('adr')).rejects.toThrow('permission denied');
      await expect(engine.validator.loadSchema('adr')).rejects.toThrow('permission denied');
    } finally {
      lstatSpy.mockRestore();
    }
  });

  test('explicit template and schema directories remain strict', async () => {
    const explicitTemplatesDir = path.join(consumerRoot, 'custom-templates');
    const explicitSchemasDir = path.join(consumerRoot, 'custom-schemas');
    const templateEngine = new TemplateEngine({
      baseDir: consumerRoot,
      templatesDir: explicitTemplatesDir,
      interactive: false,
    });
    const schemaEngine = new TemplateEngine({
      baseDir: consumerRoot,
      schemasDir: explicitSchemasDir,
      interactive: false,
    });

    await expect(templateEngine.getTemplateInfo('adr')).rejects.toThrow(
      path.join(explicitTemplatesDir, 'adr.hbs'),
    );
    await expect(templateEngine.loader.listTemplates()).rejects.toThrow(
      'Failed to list templates',
    );
    await expect(schemaEngine.validator.loadSchema('adr')).rejects.toThrow(
      'Schema not found for template type: adr',
    );
  });
});
