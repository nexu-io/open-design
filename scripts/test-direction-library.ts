/**
 * Smoke-test for the direction library.
 * Validates that renderDirectionFormBody() produces parseable, well-structured JSON.
 */
import { renderDirectionFormBody, renderDirectionSpecBlock } from '../src/prompts/directions';

function validateForm(body: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`renderDirectionFormBody() output is not valid JSON:\n${body}`);
  }

  const obj = parsed as Record<string, unknown>;
  if (!obj.description || typeof obj.description !== 'string') throw new Error('Missing or non-string "description"');
  if (!Array.isArray(obj.questions)) throw new Error('Missing or non-array "questions"');

  for (const q of obj.questions as unknown[]) {
    const question = q as Record<string, unknown>;
    if (!question.id || typeof question.id !== 'string') throw new Error(`Question missing valid id: ${JSON.stringify(q)}`);
    if (!question.label || typeof question.label !== 'string') throw new Error(`Question missing valid label: ${JSON.stringify(q)}`);
    if (!question.type || typeof question.type !== 'string') throw new Error(`Question missing valid type: ${JSON.stringify(q)}`);
    if ((question.type === 'radio' || question.type === 'checkbox' || question.type === 'select') && !Array.isArray(question.options)) {
      throw new Error(`Question "${question.id}" is ${question.type} but missing options array: ${JSON.stringify(q)}`);
    }
  }
}

try {
  const body = renderDirectionFormBody();
  validateForm(body);
  console.log('✓ renderDirectionFormBody() passes smoke-test');
} catch (err) {
  console.error('✗ Direction library smoke-test FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
}

try {
  const spec = renderDirectionSpecBlock();
  if (typeof spec !== 'string' || spec.trim().length === 0) {
    throw new Error('renderDirectionSpecBlock() returned empty string');
  }
  console.log('✓ renderDirectionSpecBlock() passes smoke-test');
} catch (err) {
  console.error('✗ Direction spec smoke-test FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
}