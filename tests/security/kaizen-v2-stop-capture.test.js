'use strict';

const yaml = require('js-yaml');
const {
  serializeYAML,
} = require('../../squads/kaizen-v2/scripts/stop-capture.cjs');

describe('Kaizen v2 stop capture YAML serialization', () => {
  test('round-trips quotes, backslashes, control characters, and YAML syntax', () => {
    const input = {
      windows_path: 'C:\\workspace\\aexos\\"quoted"',
      multiline: 'first line\nsecond line\ttabbed',
      yaml_tokens: 'value: #tag',
      values: ['C:\\temp\\capture', 'quote " and slash \\'],
    };

    expect(yaml.load(serializeYAML(input))).toEqual(input);
  });
});
