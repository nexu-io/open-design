import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { PluginManifestSchema, type PluginManifest } from '@open-design/contracts';
import { mergeManifests } from '../src/merge';
import { manifestSourceDigest } from '../src/digest';

function formManifest(properties: Record<string, unknown>): PluginManifest {
  return PluginManifestSchema.parse({
    name: 'json-field-form',
    version: '1.0.0',
    od: {
      genui: {
        surfaces: [{
          id: 'details',
          kind: 'form',
          persist: 'run',
          trigger: {},
          schema: { type: 'object', properties },
        }],
      },
    },
  });
}

function digest(manifest: PluginManifest, inputs: Record<string, string | number | boolean> = {}) {
  return manifestSourceDigest({ manifest, inputs, resolvedContextRefs: [] });
}

describe('plugin JSON property names', () => {
  it('preserves parsed GenUI properties without turning a JSON field into a prototype', () => {
    const properties = JSON.parse('{"__proto__":{"type":"string"},"constructor":{"type":"number"},"toString":{"type":"boolean"}}');
    const sidecar = formManifest(properties);
    const merged = mergeManifests({ sidecar });
    const actual = merged.od?.genui?.surfaces?.[0]?.schema?.properties as Record<string, unknown>;

    assert.deepEqual(actual, properties);
    assert.equal(Object.hasOwn(actual, '__proto__'), true);
    assert.equal(Object.getPrototypeOf(actual), Object.prototype);
    assert.equal(Object.hasOwn(Object.prototype, 'type'), false);

    (actual['__proto__'] as Record<string, unknown>).type = 'changed';
    assert.equal(properties['__proto__'].type, 'string', 'the input is still independently owned');
  });

  it('fills adapter fields whose names also exist on Object.prototype', () => {
    const settings = JSON.parse('{"constructor":"build","toString":"format","hasOwnProperty":false,"__proto__":{"caption":"keep"}}');
    const merged = mergeManifests({
      sidecar: PluginManifestSchema.parse({ name: 'json-fields', version: '1.0.0', settings: {} }),
      adapters: [PluginManifestSchema.parse({ name: 'json-fields', version: '1.0.0', settings })],
    });

    assert.deepEqual(merged.settings, settings);
    assert.equal(Object.getPrototypeOf(merged.settings), Object.prototype);
    assert.equal(Object.hasOwn(Object.prototype, 'caption'), false);
  });

  it('keeps sidecar precedence for own special fields, falsy values and arrays', () => {
    const sidecarSettings = JSON.parse('{"__proto__":{"owner":"sidecar"},"constructor":"sidecar","toString":null,"hasOwnProperty":0,"items":["sidecar"]}');
    const adapterSettings = JSON.parse('{"__proto__":{"owner":"adapter","extra":"adapter"},"constructor":"adapter","toString":"adapter","hasOwnProperty":true,"items":["adapter"],"missing":false}');
    const beforeSidecar = JSON.stringify(sidecarSettings), beforeAdapter = JSON.stringify(adapterSettings);
    const merged = mergeManifests({
      sidecar: PluginManifestSchema.parse({ name: 'json-fields', version: '1.0.0', settings: sidecarSettings }),
      adapters: [PluginManifestSchema.parse({ name: 'json-fields', version: '1.0.0', settings: adapterSettings })],
    });
    const expected = JSON.parse('{"__proto__":{"owner":"sidecar","extra":"adapter"},"constructor":"sidecar","toString":null,"hasOwnProperty":0,"items":["sidecar"],"missing":false}');

    assert.deepEqual(merged.settings, expected);
    assert.equal(JSON.stringify(sidecarSettings), beforeSidecar);
    assert.equal(JSON.stringify(adapterSettings), beforeAdapter);
    assert.equal(Object.getPrototypeOf(merged.settings), Object.prototype);
  });

  it('includes JSON-named GenUI properties in the source digest', () => {
    const first = formManifest(JSON.parse('{"__proto__":{"type":"string","default":"first"}}'));
    const second = formManifest(JSON.parse('{"__proto__":{"type":"string","default":"second"}}'));
    const omitted = formManifest({});

    assert.notEqual(digest(first), digest(second));
    assert.notEqual(digest(first), digest(omitted));
  });

  it('distinguishes an input named __proto__ from a missing or changed input', () => {
    const manifest: PluginManifest = {
      name: 'named-input',
      version: '1.0.0',
      od: { inputs: [{ name: '__proto__', type: 'string' }] },
    };

    assert.notEqual(
      digest(manifest, JSON.parse('{"__proto__":"first"}')),
      digest(manifest, JSON.parse('{"__proto__":"second"}')),
    );
    assert.notEqual(digest(manifest, JSON.parse('{"__proto__":"first"}')), digest(manifest));
  });

  it('keeps object-key order canonical and preserves array order', () => {
    const first = formManifest(JSON.parse('{"__proto__":{"type":"string","default":"kept"},"topic":{"enum":["first","second"]}}'));
    const reordered = formManifest(JSON.parse('{"topic":{"enum":["first","second"]},"__proto__":{"default":"kept","type":"string"}}'));
    const arrayChanged = formManifest(JSON.parse('{"topic":{"enum":["second","first"]},"__proto__":{"default":"kept","type":"string"}}'));

    assert.equal(digest(first), digest(reordered));
    assert.notEqual(digest(first), digest(arrayChanged));
  });
});
