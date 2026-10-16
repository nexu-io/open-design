import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import {
  DTCG_FORMAT_SCHEMA_URL,
  DTCG_FORMAT_VERSION,
  DTCG_TOKEN_TYPES,
  parseDtcgFormat2025_10,
  serializeDtcgFormat2025_10,
  type DtcgDiagnosticCode,
  type DtcgFormatDocument,
  type DtcgFormatParseResult,
} from '../src/design-systems/dtcg-2025-10.js';

describe('DTCG Format 2025.10 codec', () => {
  it('emits documents accepted by the pinned official 2025.10 schema', () => {
    const schema = JSON.parse(
      readFileSync(new URL('./fixtures/dtcg-2025-10/format.schema.json', import.meta.url), 'utf8'),
    ) as object;
    const validate = new Ajv({ allErrors: true, strict: false, validateFormats: false }).compile(schema);
    const parsed = expectValid({
      palette: {
        $type: 'color',
        primary: { $value: color() },
        secondary: { $value: '{palette.primary}' },
      },
      spacing: token('dimension', dimension(1, 'rem')),
    });
    const output = JSON.parse(
      serializeDtcgFormat2025_10(parsed.document, { includeSchemaMetadata: true }),
    ) as object;

    expect(validate(output), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('pins the stable profile and supports all 13 normative token types', () => {
    expect(DTCG_FORMAT_VERSION).toBe('2025.10');
    expect(DTCG_FORMAT_SCHEMA_URL).toBe('https://www.designtokens.org/schemas/2025.10/format.json');
    expect(DTCG_TOKEN_TYPES).toHaveLength(13);

    const result = expectValid({
      color: token('color', color()),
      dimension: token('dimension', dimension(16, 'px')),
      fontFamily: token('fontFamily', ['Inter', 'sans-serif']),
      fontWeight: token('fontWeight', 'semi-bold'),
      duration: token('duration', { value: 150, unit: 'ms' }),
      cubicBezier: token('cubicBezier', [0.2, -0.5, 0.8, 1.5]),
      number: token('number', -1.25),
      strokeStyle: token('strokeStyle', {
        dashArray: [dimension(2, 'px'), dimension(1, 'rem')],
        lineCap: 'round',
      }),
      border: token('border', {
        color: color(),
        width: dimension(1, 'px'),
        style: 'solid',
      }),
      transition: token('transition', {
        duration: { value: 200, unit: 'ms' },
        delay: { value: -50, unit: 'ms' },
        timingFunction: [0.2, 0, 0, 1],
      }),
      shadow: token('shadow', {
        color: color(0.5),
        offsetX: dimension(0, 'px'),
        offsetY: dimension(2, 'px'),
        blur: dimension(8, 'px'),
        spread: dimension(-1, 'px'),
        inset: false,
      }),
      gradient: token('gradient', [
        { color: color(), position: 0 },
        { color: color(0.4), position: 1 },
      ]),
      typography: token('typography', {
        fontFamily: ['Inter', 'sans-serif'],
        fontSize: dimension(1, 'rem'),
        fontWeight: 550,
        letterSpacing: dimension(-0.02, 'rem'),
        lineHeight: 1.5,
      }),
    });

    expect(result.tokens.map((entry) => entry.type)).toEqual(DTCG_TOKEN_TYPES);
  });

  it('validates every stable color space and permits none components', () => {
    const colorValues = {
      srgb: [0, 0.5, 1],
      'srgb-linear': [0, 0.5, 1],
      hsl: ['none', 100, 50],
      hwb: [359.9, 0, 100],
      lab: [50, -200, 200],
      lch: [50, 230, 359.9],
      oklab: [0.5, -2, 2],
      oklch: [0.5, 1.5, 'none'],
      'display-p3': [0, 0.5, 1],
      'a98-rgb': [0, 0.5, 1],
      'prophoto-rgb': [0, 0.5, 1],
      rec2020: [0, 0.5, 1],
      'xyz-d65': [0, 0.5, 1],
      'xyz-d50': [0, 0.5, 1],
    } as const;
    const document = Object.fromEntries(
      Object.entries(colorValues).map(([colorSpace, components]) => [
        colorSpace,
        token('color', { colorSpace, components: [...components], alpha: 0, hex: '#00ffAA' }),
      ]),
    );

    expect(expectValid(document).tokens).toHaveLength(14);
  });

  it('resolves inherited types, root tokens, curly aliases, and property references', () => {
    const result = expectValid({
      palette: {
        $type: 'color',
        accent: {
          $root: {
            $value: color(),
            $description: 'Base accent',
            $extensions: { 'org.example': { source: 'brand' } },
          },
          soft: { $value: color(0.4) },
        },
      },
      semantic: {
        $deprecated: 'Use component tokens.',
        action: { $value: '{palette.accent.$root}' },
      },
      dimensions: {
        $type: 'dimension',
        small: { $value: dimension(4, 'px') },
      },
      border: {
        $type: 'border',
        focus: {
          $value: {
            color: '{palette.accent.$root}',
            width: { $ref: '#/dimensions/small/$value' },
            style: 'solid',
          },
        },
      },
      copiedWidth: {
        $type: 'dimension',
        $value: { $ref: '#/dimensions/small/$value' },
      },
    });

    expect(findToken(result, '#/semantic/action')).toMatchObject({
      type: 'color',
      deprecated: 'Use component tokens.',
      value: color(),
    });
    expect(findToken(result, '#/border/focus').value).toMatchObject({ width: dimension(4, 'px') });
    expect(findToken(result, '#/copiedWidth')).toMatchObject({ type: 'dimension', value: dimension(4, 'px') });
    expect(findToken(result, '#/palette/accent/$root').source.$extensions).toEqual({
      'org.example': { source: 'brand' },
    });
  });

  it('accepts token-level JSON Pointer aliases and enforces reference types', () => {
    const valid = expectValid({
      base: token('number', 2),
      alias: { $ref: '#/base' },
      valueAlias: { $value: { $ref: '#/base/$value' } },
    });
    expect(findToken(valid, '#/alias')).toMatchObject({ type: 'number', value: 2 });
    expect(findToken(valid, '#/valueAlias')).toMatchObject({ type: 'number', value: 2 });

    expectInvalid(
      {
        base: token('number', 2),
        alias: { $type: 'dimension', $value: '{base}' },
      },
      'reference-type-mismatch',
    );
  });

  it('deep-merges extended groups while replacing complete token definitions', () => {
    const result = expectValid({
      base: {
        $type: 'color',
        normal: { $value: color() },
        state: {
          hover: { $value: color(0.8), $description: 'Inherited description' },
          active: { $value: color(0.6) },
        },
      },
      primary: {
        $extends: '{base}',
        normal: { $value: color(0.7) },
        state: {
          hover: { $value: color(0.5) },
        },
      },
    });

    expect(findToken(result, '#/primary/normal').value).toEqual(color(0.7));
    expect(findToken(result, '#/primary/state/hover').source).not.toHaveProperty('$description');
    expect(findToken(result, '#/primary/state/active')).toMatchObject({
      value: color(0.6),
      sourcePointer: '#/base/state/active',
    });
  });

  it('resolves nested extensions before applying outer inherited groups', () => {
    const result = expectValid({
      base: {
        $type: 'number',
        nested: {
          value: { $value: 1 },
          inheritedOnly: { $value: 10 },
        },
      },
      other: {
        $type: 'number',
        value: { $value: 2 },
      },
      derived: {
        $extends: '{base}',
        nested: {
          $extends: '{other}',
        },
      },
    });

    expect(findToken(result, '#/derived/nested/value')).toMatchObject({
      value: 2,
      sourcePointer: '#/other/value',
    });
    expect(findToken(result, '#/derived/nested/inheritedOnly')).toMatchObject({
      value: 10,
      sourcePointer: '#/base/nested/inheritedOnly',
    });
  });

  it('supports RFC 6901 escaping, URI fragments, array indices, and the root pointer', () => {
    const result = expectValid({
      'a/b~c': token('number', 4),
      copied: { $type: 'number', $ref: '#/a~1b~0c/$value' },
      family: token('fontFamily', ['Inter', 'Mono']),
      firstFamily: { $type: 'fontFamily', $ref: '#/family/$value/0' },
      encoded: { $type: 'fontFamily', $ref: '#/family/$value/%31' },
    });

    expect(findToken(result, '#/copied').value).toBe(4);
    expect(findToken(result, '#/firstFamily').value).toBe('Inter');
    expect(findToken(result, '#/encoded').value).toBe('Mono');
    expectInvalid({ invalid: { $type: 'number', $ref: '#' } }, 'invalid-value');
  });

  it('reports cycles for aliases and group extension chains', () => {
    expectInvalid(
      {
        a: { $type: 'number', $value: '{b}' },
        b: { $type: 'number', $value: '{a}' },
      },
      'circular-reference',
    );
    expectInvalid(
      {
        a: { $extends: '{b}' },
        b: { $extends: '{a}' },
      },
      'circular-reference',
    );
    expectInvalid(
      {
        a: { $type: 'number', $ref: '#/b' },
        b: { $type: 'number', $ref: '#/a' },
      },
      'circular-reference',
    );
    expectInvalid(
      {
        a: {
          $type: 'border',
          $value: {
            color: { $ref: '#/a/$value/color' },
            width: dimension(1, 'px'),
            style: 'solid',
          },
        },
      },
      'circular-reference',
    );
  });

  it('rejects shape-compatible composite references with the wrong token type', () => {
    expectInvalid(
      {
        weight: token('fontWeight', 500),
        gradient: token('gradient', [{ color: color(), position: '{weight}' }]),
      },
      'reference-type-mismatch',
    );
    expectInvalid(
      {
        scalar: token('number', 2),
        typography: token('typography', {
          fontFamily: ['Inter'],
          fontSize: dimension(16, 'px'),
          fontWeight: '{scalar}',
          letterSpacing: dimension(0, 'px'),
          lineHeight: 1.4,
        }),
      },
      'reference-type-mismatch',
    );
  });

  it('unwraps only singleton gradient aliases and never flattens multi-stop arrays', () => {
    const result = expectValid({
      start: token('gradient', [{ color: color(), position: 0 }]),
      end: token('gradient', [{ color: color(0.5), position: 1 }]),
      combined: token('gradient', ['{start}', { color: color(0.75), position: 0.5 }, '{end}']),
    });
    expect(findToken(result, '#/combined').value).toEqual([
      { color: color(), position: 0 },
      { color: color(0.75), position: 0.5 },
      { color: color(0.5), position: 1 },
    ]);

    expectInvalid(
      {
        multiple: token('gradient', [
          { color: color(), position: 0 },
          { color: color(0.5), position: 1 },
        ]),
        combined: token('gradient', ['{multiple}']),
      },
      'invalid-value',
    );
  });

  it('does not guess types and rejects invalid names or token/group ambiguity', () => {
    expectInvalid({ untyped: { $value: 1 } }, 'missing-type');
    expectInvalid({ 'bad.name': token('number', 1) }, 'invalid-name');
    expectInvalid({ '$custom': token('number', 1) }, 'unknown-reserved-property');
    expectInvalid(
      { ambiguous: { $type: 'number', $value: 1, child: token('number', 2) } },
      'invalid-token',
    );
  });

  it('enforces color, unit, font-weight, cubic-bezier, and composite constraints', () => {
    expectInvalid({ bad: token('color', { colorSpace: 'srgb', components: [0, 0, 1.1] }) }, 'invalid-value');
    expectInvalid({ bad: token('color', { colorSpace: 'hsl', components: [360, 50, 50] }) }, 'invalid-value');
    expectInvalid({ bad: token('color', { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000' }) }, 'invalid-value');
    expectInvalid({ bad: token('dimension', { value: 1, unit: 'em' }) }, 'invalid-value');
    expectInvalid({ bad: token('fontWeight', 1001) }, 'invalid-value');
    expectInvalid({ bad: token('cubicBezier', [-0.1, 0, 1, 1]) }, 'invalid-value');
    expectInvalid(
      { bad: token('border', { color: color(), width: dimension(1, 'px'), style: 'solid', extra: true }) },
      'invalid-value',
    );
  });

  it('preserves normative source values while normalizing only the resolved gradient position', () => {
    const result = expectValid({
      gradient: token('gradient', [
        { color: color(), position: -0.25 },
        { color: color(0.5), position: 1.25 },
      ]),
      emptyShadow: token('shadow', []),
      emptyGradient: token('gradient', []),
    });

    expect(findToken(result, '#/gradient').value).toEqual([
      { color: color(), position: 0 },
      { color: color(0.5), position: 1 },
    ]);
    expect((result.document.gradient as { $value: unknown }).$value).toEqual([
      { color: color(), position: -0.25 },
      { color: color(0.5), position: 1.25 },
    ]);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === 'schema-divergence')).toHaveLength(2);
  });

  it('serializes deterministically and preserves extensions, deprecation, and references', () => {
    const parsed = expectValid({
      $schema: DTCG_FORMAT_SCHEMA_URL,
      z: {
        $value: '{a}',
        $deprecated: false,
        $extensions: { 'org.example': { z: 1, a: ['kept'] } },
      },
      a: token('number', 1),
    });

    const withoutSchema = serializeDtcgFormat2025_10(parsed.document);
    const withSchema = serializeDtcgFormat2025_10(parsed.document, { includeSchemaMetadata: true });
    expect(withoutSchema).not.toContain('$schema');
    expect(withSchema).toContain(`"$schema": "${DTCG_FORMAT_SCHEMA_URL}"`);
    expect(withSchema.indexOf('"$schema"')).toBeLessThan(withSchema.indexOf('"a"'));
    expect(withoutSchema).toContain('"$deprecated": false');
    expect(withoutSchema).toContain('"org.example"');
    expect(withoutSchema).toContain('"$value": "{a}"');

    const reparsed = expectValid(JSON.parse(withoutSchema));
    expect(reparsed.document).toEqual({
      a: token('number', 1),
      z: {
        $deprecated: false,
        $extensions: { 'org.example': { a: ['kept'], z: 1 } },
        $value: '{a}',
      },
    });
  });

  it('throws when asked to serialize an invalid document', () => {
    expect(() => serializeDtcgFormat2025_10({ bad: { $value: 1 } })).toThrow(/missing.*type|type cannot be determined/i);
  });

  it('rejects documents carrying a $schema that identifies a different profile', () => {
    expectInvalid(
      {
        $schema: 'https://design-tokens.org/schema.json',
        token: token('number', 1),
      },
      'profile-mismatch',
    );
    expectInvalid(
      {
        $schema: 'https://example.com/unrelated.schema.json',
        token: token('number', 1),
      },
      'profile-mismatch',
    );
    const result = parseDtcgFormat2025_10({
      $schema: DTCG_FORMAT_SCHEMA_URL,
      token: token('number', 1),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diagnostics.map((d) => d.code)).toContain('non-normative-schema-property');
      expect(result.diagnostics.map((d) => d.code)).not.toContain('profile-mismatch');
    }
  });

  it('accepts empty fontFamily arrays per normative report while flagging schema divergence', () => {
    const result = parseDtcgFormat2025_10({ family: token('fontFamily', []) });
    expect(result.ok, formatDiagnostics(result)).toBe(true);
    if (result.ok) {
      expect(result.diagnostics.map((d) => d.code)).toContain('schema-divergence');
      expect(result.tokens.map((t) => t.value)).toEqual([[]]);
    }
    expectInvalid({ bad: token('fontFamily', [1, 2]) }, 'invalid-value');
  });

  it('preserves schema-valid __proto__ groups and tokens through $extends merges and serialization', () => {
    // An object literal would mutate the prototype instead of creating an own
    // property, so the document is built through JSON.parse.
    const input = JSON.parse(`{
      "base": { "__proto__": { "x": { "$type": "number", "$value": 1 } } },
      "derived": { "$extends": "{base}" },
      "top": { "__proto__": { "$type": "number", "$value": 2 } }
    }`);

    const result = expectValid(input);
    const inherited = findToken(result, '#/derived/__proto__/x');
    expect(inherited).toMatchObject({ value: 1, sourcePointer: '#/base/__proto__/x' });
    expect(findToken(result, '#/top/__proto__')).toMatchObject({ value: 2, sourcePointer: '#/top/__proto__' });
    expect(Object.prototype.hasOwnProperty.call(result.document.base, '__proto__')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(result.document.top, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(result.document)).toBe(Object.prototype);

    const serialized = serializeDtcgFormat2025_10(result.document);
    const reparsed = JSON.parse(serialized) as {
      base: { __proto__: unknown } & Record<string, unknown>;
      top: { __proto__: unknown } & Record<string, unknown>;
      derived: Record<string, unknown>;
    };
    expect(Object.prototype.hasOwnProperty.call(reparsed.base, '__proto__')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(reparsed.top, '__proto__')).toBe(true);
    expect(reparsed.base.__proto__).toEqual({ x: token('number', 1) });
    expect(reparsed.top.__proto__).toEqual(token('number', 2));
    // Serialization preserves source references: the derived group keeps its
    // $extends instead of writing the materialized merge into the document.
    expect(reparsed.derived).toEqual({ $extends: '{base}' });
  });

  it('rejects curly-brace references at pointer-only value positions', () => {
    const base = token('color', color());
    const document = {
      base,
      dim: token('dimension', dimension(4, 'px')),
      family: token('fontFamily', ['Inter']),
    };
    expectInvalid({ ...document, bad: token('color', { ...color(), hex: '{base}' }) }, 'invalid-reference');
    expectInvalid({ ...document, bad: token('color', { ...color(), colorSpace: '{base}' }) }, 'invalid-reference');
    expectInvalid({ ...document, bad: token('color', { ...color(), components: ['{base}', 0.2, 0.3] }) }, 'invalid-reference');
    expectInvalid({ ...document, bad: token('color', { ...color(), components: [0.1, '{base}', 0.3] }) }, 'invalid-reference');
    expectInvalid({ ...document, bad: token('color', { ...color(), alpha: '{base}' }) }, 'invalid-reference');
    expectInvalid({ ...document, bad: token('dimension', { value: 4, unit: '{base}' }) }, 'invalid-reference');
    expectInvalid({ ...document, bad: token('dimension', { value: '{base}', unit: 'px' }) }, 'invalid-reference');
    expectInvalid(
      { ...document, bad: token('strokeStyle', { dashArray: [dimension(1, 'px')], lineCap: '{base}' }) },
      'invalid-reference',
    );
    expectInvalid({ ...document, bad: token('fontFamily', ['{base}']) }, 'invalid-reference');
    expectInvalid(
      {
        ...document,
        bad: token('typography', {
          fontFamily: ['{base}'],
          fontSize: dimension(16, 'px'),
          fontWeight: 500,
          letterSpacing: dimension(0, 'px'),
          lineHeight: 1.4,
        }),
      },
      'invalid-reference',
    );
    expectInvalid(
      {
        ...document,
        bad: token('shadow', {
          color: color(),
          offsetX: dimension(0, 'px'),
          offsetY: dimension(2, 'px'),
          blur: dimension(8, 'px'),
          spread: dimension(0, 'px'),
          inset: '{base}',
        }),
      },
      'invalid-reference',
    );
    expectInvalid({ ...document, bad: token('cubicBezier', ['{base}', 0, 1, 1] as unknown as number[]) }, 'invalid-reference');
  });

  it('resolves allowed composite references while preserving literal-only positions', () => {
    const result = expectValid({
      base: token('color', color()),
      tone: token('color', { ...color(), alpha: 0.5 }),
      familySource: token('fontFamily', ['#1a334d']),
      dim: token('dimension', dimension(4, 'px')),
      dash: token('dimension', dimension(2, 'px')),
      stroke: token('strokeStyle', { dashArray: [dimension(2, 'px')], lineCap: 'round' }),
      border: token('border', {
        color: '{base}',
        width: '{dim}',
        style: {
          dashArray: [dimension(1, 'px'), '{dash}', { $ref: '#/dim/$value' }],
          lineCap: 'round',
        },
      }),
      colorCopy: token('color', { ...color(), hex: { $ref: '#/familySource/$value/0' } }),
      spaceCopy: token('color', { ...color(), colorSpace: { $ref: '#/base/$value/colorSpace' } }),
      componentCopy: token('color', { ...color(), components: [{ $ref: '#/tone/$value/alpha' }, 0.2, 0.3] }),
      alphaCopy: token('color', { ...color(), alpha: { $ref: '#/tone/$value/alpha' } }),
      typography: token('typography', {
        fontFamily: [{ $ref: '#/familySource/$value/0' }],
        fontSize: '{dim}',
        fontWeight: '{weight}',
        letterSpacing: { $ref: '#/dim/$value' },
        lineHeight: { $ref: '#/lineHeight/$value' },
      }),
      weight: token('fontWeight', 500),
      number: token('number', 0.4),
      lineHeight: token('number', 1.4),
      gradientPosition: token('number', 0.7),
      gradientRef: token('gradient', [{ color: '{base}', position: '{gradientPosition}' }]),
      strokeRef: token('border', { color: color(), width: dimension(1, 'px'), style: '{stroke}' }),
    });

    expect(findToken(result, '#/border').value).toEqual({
      color: color(),
      width: dimension(4, 'px'),
      style: {
        dashArray: [
          dimension(1, 'px'),
          dimension(2, 'px'),
          dimension(4, 'px'),
          dimension(1, 'px'),
          dimension(2, 'px'),
          dimension(4, 'px'),
        ],
        lineCap: 'round',
      },
    });
    expect(findToken(result, '#/colorCopy').value).toMatchObject({ hex: '#1a334d' });
    expect(findToken(result, '#/spaceCopy').value).toMatchObject({ colorSpace: 'srgb' });
    expect(findToken(result, '#/componentCopy').value).toMatchObject({ components: [0.5, 0.2, 0.3] });
    expect(findToken(result, '#/alphaCopy').value).toMatchObject({ alpha: 0.5 });
    expect(findToken(result, '#/typography').value).toEqual({
      fontFamily: ['#1a334d'],
      fontSize: dimension(4, 'px'),
      fontWeight: 500,
      letterSpacing: dimension(4, 'px'),
      lineHeight: 1.4,
    });
    expect(findToken(result, '#/gradientRef').value).toEqual([{ color: color(), position: 0.7 }]);
    expect(findToken(result, '#/strokeRef').value).toMatchObject({
      style: { dashArray: [dimension(2, 'px'), dimension(2, 'px')], lineCap: 'round' },
    });
  });

  it('repeats odd dashArray values in resolved strokeStyle and border values while preserving the source', () => {
    const result = expectValid({
      one: token('strokeStyle', { dashArray: [dimension(2, 'px')], lineCap: 'round' }),
      two: token('strokeStyle', { dashArray: [dimension(2, 'px'), dimension(4, 'px')], lineCap: 'round' }),
      three: token('strokeStyle', {
        dashArray: [dimension(1, 'px'), '{dash}', { $ref: '#/dash/$value' }],
        lineCap: 'butt',
      }),
      dash: token('dimension', dimension(2, 'px')),
      border: token('border', {
        color: color(),
        width: dimension(1, 'px'),
        style: { dashArray: [dimension(3, 'px')], lineCap: 'square' },
      }),
    });

    expect(findToken(result, '#/one').value).toEqual({ dashArray: [dimension(2, 'px'), dimension(2, 'px')], lineCap: 'round' });
    expect(findToken(result, '#/two').value).toEqual({
      dashArray: [dimension(2, 'px'), dimension(4, 'px')],
      lineCap: 'round',
    });
    expect(findToken(result, '#/three').value).toEqual({
      dashArray: [dimension(1, 'px'), dimension(2, 'px'), dimension(2, 'px'), dimension(1, 'px'), dimension(2, 'px'), dimension(2, 'px')],
      lineCap: 'butt',
    });
    expect(findToken(result, '#/border').value).toMatchObject({
      style: { dashArray: [dimension(3, 'px'), dimension(3, 'px')], lineCap: 'square' },
    });

    expect((result.document.one as { $value: unknown }).$value).toEqual({
      dashArray: [dimension(2, 'px')],
      lineCap: 'round',
    });
    expect((result.document.three as { $value: unknown }).$value).toEqual({
      dashArray: [dimension(1, 'px'), '{dash}', { $ref: '#/dash/$value' }],
      lineCap: 'butt',
    });
    expect((result.document.border as { $value: { style: unknown } }).$value.style).toEqual({
      dashArray: [dimension(3, 'px')],
      lineCap: 'square',
    });
  });
});

function token(type: string, value: unknown): Record<string, unknown> {
  return { $type: type, $value: value };
}

function dimension(value: number, unit: 'px' | 'rem'): { value: number; unit: 'px' | 'rem' } {
  return { value, unit };
}

function color(alpha?: number): Record<string, unknown> {
  return {
    colorSpace: 'srgb',
    components: [0.1, 0.2, 0.3],
    hex: '#1a334d',
    ...(alpha === undefined ? {} : { alpha }),
  };
}

function expectValid(input: unknown): Extract<DtcgFormatParseResult, { ok: true }> {
  const result = parseDtcgFormat2025_10(input);
  expect(result.ok, formatDiagnostics(result)).toBe(true);
  if (!result.ok) throw new Error(formatDiagnostics(result));
  return result;
}

function expectInvalid(input: unknown, code: DtcgDiagnosticCode): void {
  const result = parseDtcgFormat2025_10(input);
  expect(result.ok, 'Expected the document to be invalid.').toBe(false);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code), formatDiagnostics(result)).toContain(code);
}

function findToken(result: Extract<DtcgFormatParseResult, { ok: true }>, pointer: string) {
  const found = result.tokens.find((entry) => entry.pointer === pointer);
  expect(found, `Missing resolved token ${pointer}.`).toBeDefined();
  return found!;
}

function formatDiagnostics(result: DtcgFormatParseResult): string {
  return result.diagnostics
    .map((diagnostic) => `${diagnostic.severity} ${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`)
    .join('\n');
}

const _typecheckDocument: DtcgFormatDocument = { token: { $type: 'number', $value: 1 } };
void _typecheckDocument;
