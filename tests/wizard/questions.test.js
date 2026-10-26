// Deterministic question definitions run in the default unit suite.
/**
 * Questions Test Suite
 * 
 * Tests question definitions and sequencing logic
 */

const {
  getProjectTypeQuestion,
  getUserProfileQuestion,
  getIDEQuestions,
  getMCPQuestions,
  getTechPresetQuestion,
  getEnvironmentQuestions,
  buildQuestionSequence,
  getQuestionById,
} = require('../../packages/installer/src/wizard/questions');

describe('questions', () => {
  describe('getProjectTypeQuestion', () => {
    test('returns valid inquirer question object', () => {
      const question = getProjectTypeQuestion();

      expect(question).toHaveProperty('type', 'list');
      expect(question).toHaveProperty('name', 'projectType');
      expect(question).toHaveProperty('message');
      expect(question).toHaveProperty('choices');
      expect(question).toHaveProperty('validate');
    });

    test('has greenfield and brownfield choices', () => {
      const question = getProjectTypeQuestion();

      expect(question.choices).toHaveLength(2);
      expect(question.choices[0]).toHaveProperty('value', 'greenfield');
      expect(question.choices[1]).toHaveProperty('value', 'brownfield');
    });

    test('includes validator function', () => {
      const question = getProjectTypeQuestion();
      
      expect(typeof question.validate).toBe('function');
    });

    test('validator accepts valid project types', () => {
      const question = getProjectTypeQuestion();
      
      expect(question.validate('greenfield')).toBe(true);
      expect(question.validate('brownfield')).toBe(true);
    });

    test('validator rejects invalid project types', () => {
      const question = getProjectTypeQuestion();

      const result = question.validate('invalid');
      expect(result).not.toBe(true);
      expect(typeof result).toBe('string');
    });
  });

  describe('getUserProfileQuestion (Story 10.2)', () => {
    test('returns valid inquirer question object', () => {
      const question = getUserProfileQuestion();

      expect(question).toHaveProperty('type', 'list');
      expect(question).toHaveProperty('name', 'userProfile');
      expect(question).toHaveProperty('message');
      expect(question).toHaveProperty('choices');
    });

    test('has bob (assisted) and advanced choices', () => {
      const question = getUserProfileQuestion();

      expect(question.choices).toHaveLength(2);
      expect(question.choices[0]).toHaveProperty('value', 'bob');
      expect(question.choices[1]).toHaveProperty('value', 'advanced');
    });

    test('bob choice includes assisted mode indicator', () => {
      const question = getUserProfileQuestion();

      expect(question.choices[0].name).toMatch(/Assisted Mode/);
      expect(question.choices[0].short).toBe('Assisted Mode');
      expect(question.choices[0].value).toBe('bob');
    });

    test('advanced choice includes advanced mode indicator', () => {
      const question = getUserProfileQuestion();

      expect(question.choices[1].name).toMatch(/Advanced Mode/);
      expect(question.choices[1].short).toBe('Advanced Mode');
      expect(question.choices[1].value).toBe('advanced');
    });

    test('defaults to advanced (index 1) for backward compatibility', () => {
      const question = getUserProfileQuestion();

      // Default should be index 1 (advanced) for backward compatibility
      expect(question.default).toBe(1);
    });

    test('profile descriptions distinguish guidance from direct control', () => {
      const question = getUserProfileQuestion();

      expect(question.choices[0].description).toMatch(/Bob.*validation/);
      expect(question.choices[1].description).toMatch(/direct access to all agents/);
    });
  });

  describe('getIDEQuestions', () => {
    test('returns array of IDE selection questions (Story 1.4)', () => {
      const questions = getIDEQuestions();
      expect(Array.isArray(questions)).toBe(true);
    });

    test('returns one IDE selection question', () => {
      const questions = getIDEQuestions();
      expect(questions).toHaveLength(1);
      expect(questions[0]).toHaveProperty('name', 'selectedIDEs');
      expect(questions[0]).toHaveProperty('type', 'checkbox');
    });
  });

  describe('getMCPQuestions', () => {
    test('returns array (placeholder for Story 1.5)', () => {
      const questions = getMCPQuestions();
      expect(Array.isArray(questions)).toBe(true);
    });

    test('returns one optional MCP selection question', () => {
      const questions = getMCPQuestions();
      expect(questions).toHaveLength(1);
      expect(questions[0]).toHaveProperty('name', 'selectedMCPs');
      expect(questions[0]).toHaveProperty('type', 'checkbox');
    });
  });

  describe('getTechPresetQuestion', () => {
    test('returns one tech preset selection question', () => {
      const questions = getTechPresetQuestion();
      expect(questions).toHaveLength(1);
      expect(questions[0]).toHaveProperty('name', 'selectedTechPreset');
      expect(questions[0]).toHaveProperty('type', 'list');
    });

    test('includes Angular NestJS preset choice', () => {
      const [question] = getTechPresetQuestion();
      const values = question.choices.map((choice) => choice.value);

      expect(values).toContain('angular-nestjs');
    });
  });

  describe('getEnvironmentQuestions', () => {
    test('returns array (placeholder for Story 1.6)', () => {
      const questions = getEnvironmentQuestions();
      expect(Array.isArray(questions)).toBe(true);
    });

    test('currently returns empty array', () => {
      const questions = getEnvironmentQuestions();
      expect(questions).toHaveLength(0);
    });
  });

  describe('buildQuestionSequence', () => {
    test('returns array of questions', () => {
      const questions = buildQuestionSequence();
      expect(Array.isArray(questions)).toBe(true);
    });

    test('asks language before project type, IDEs and tech preset', () => {
      const questions = buildQuestionSequence();
      expect(questions).toHaveLength(4);
      expect(questions.map((question) => question.name)).toEqual([
        'language',
        'projectType',
        'selectedIDEs',
        'selectedTechPreset',
      ]);
    });

    test('accepts context parameter', () => {
      const context = { someValue: 'test' };
      const questions = buildQuestionSequence(context);
      expect(Array.isArray(questions)).toBe(true);
    });

    test('keeps the approved minimal sequence for both project contexts', () => {
      const contextGreenfield = { projectType: 'greenfield' };
      const contextBrownfield = { projectType: 'brownfield' };

      const expectedOrder = ['language', 'projectType', 'selectedIDEs', 'selectedTechPreset'];
      expect(buildQuestionSequence(contextGreenfield).map(question => question.name)).toEqual(expectedOrder);
      expect(buildQuestionSequence(contextBrownfield).map(question => question.name)).toEqual(expectedOrder);
    });
  });

  describe('getQuestionById', () => {
    test('returns projectType question by ID', () => {
      const question = getQuestionById('projectType');
      expect(question).not.toBeNull();
      expect(question).toHaveProperty('name', 'projectType');
    });

    test('returns null for unknown ID', () => {
      const question = getQuestionById('unknownQuestion');
      expect(question).toBeNull();
    });

    test('handles undefined ID', () => {
      const question = getQuestionById(undefined);
      expect(question).toBeNull();
    });
  });

  describe('Question Message Formatting', () => {
    test('projectType question has colored message', () => {
      const question = getProjectTypeQuestion();
      // Message should be wrapped in color function (contains ANSI codes)
      expect(typeof question.message).toBe('string');
      expect(question.message.length).toBeGreaterThan(0);
    });

    test('choices have descriptive names', () => {
      const question = getProjectTypeQuestion();
      
      expect(question.choices[0]).toMatchObject({ value: 'greenfield', short: 'Greenfield' });
      expect(question.choices[1]).toMatchObject({ value: 'brownfield', short: 'Brownfield' });
      expect(question.choices[0].name).toMatch(/^Greenfield\b.*new project from scratch/);
      expect(question.choices[1].name).toMatch(/^Brownfield\b.*existing project/);
    });

    test('choices include helpful descriptions', () => {
      const question = getProjectTypeQuestion();
      
      expect(question.choices[0].description).toMatch(/new project from scratch/);
      expect(question.choices[1].description).toMatch(/existing project/);
    });
  });
});
