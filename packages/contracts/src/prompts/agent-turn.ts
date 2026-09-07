import {
  type CanonicalXmlNode,
  indexCanonicalXmlChildren,
  parseCanonicalXml,
  requireCanonicalXmlAttribute,
  requireCanonicalXmlElement,
  requireCanonicalXmlText,
  serializeCanonicalXml,
} from './canonical-xml.js';

export const OPEN_DESIGN_AGENT_TURN_SCHEMA_V1 = 'open-design.agent-turn/v1' as const;

/**
 * Strategy-neutral prompt payload for one ordinary Agent turn.
 *
 * `attachmentsMarkdown` and `contextMarkdown` use `null` for an intentionally
 * empty slot. The serializer preserves those positions with marker nodes, so
 * omitting content cannot shift the lifecycle or user-request boundaries.
 * Discovery bootstrap and compact lifecycle state are mutually exclusive. At
 * most one may be present; when neither is present the serializer emits one
 * stable `lifecycle_empty` marker.
 */
export interface OpenDesignAgentTurnV1 {
  instructionsMarkdown: string;
  attachmentsMarkdown: string | null;
  contextMarkdown: string | null;
  discoveryBootstrapMarkdown?: string | undefined;
  compactLifecycleCapsuleMarkdown?: string | undefined;
  userFirstPrompt: string;
}

const TURN_SLOTS = [
  'instructions',
  'attachments',
  'attachments_empty',
  'context',
  'context_empty',
  'discovery_bootstrap',
  'compact_lifecycle_capsule',
  'lifecycle_empty',
  'user_first_prompt',
  'user_first_prompt_empty',
] as const;

function requireNonEmptyMarkdown(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(field + ' must be a string.');
  }
  if (value.trim().length === 0) {
    throw new TypeError(field + ' must not be empty.');
  }
  return value;
}

function nullableMarkdownNode(
  tag: 'attachments' | 'context',
  value: unknown,
): CanonicalXmlNode {
  if (value === null) return { kind: 'marker', tag: tag + '_empty' };
  return {
    kind: 'text',
    tag,
    text: requireNonEmptyMarkdown(value, tag + 'Markdown'),
  };
}

function lifecycleNode(input: OpenDesignAgentTurnV1): CanonicalXmlNode {
  const discovery = input.discoveryBootstrapMarkdown;
  const capsule = input.compactLifecycleCapsuleMarkdown;
  if (discovery !== undefined && capsule !== undefined) {
    throw new TypeError(
      'discoveryBootstrapMarkdown and compactLifecycleCapsuleMarkdown are mutually exclusive.',
    );
  }
  if (discovery !== undefined) {
    return {
      kind: 'text',
      tag: 'discovery_bootstrap',
      text: requireNonEmptyMarkdown(discovery, 'discoveryBootstrapMarkdown'),
    };
  }
  if (capsule !== undefined) {
    return {
      kind: 'text',
      tag: 'compact_lifecycle_capsule',
      text: requireNonEmptyMarkdown(capsule, 'compactLifecycleCapsuleMarkdown'),
    };
  }
  return { kind: 'marker', tag: 'lifecycle_empty' };
}

function userPromptNode(value: unknown): CanonicalXmlNode {
  if (typeof value !== 'string') {
    throw new TypeError('userFirstPrompt must be a string.');
  }
  return value.trim().length === 0
    ? { kind: 'marker', tag: 'user_first_prompt_empty' }
    : { kind: 'text', tag: 'user_first_prompt', text: value };
}

function buildTree(input: OpenDesignAgentTurnV1): CanonicalXmlNode {
  return {
    kind: 'element',
    tag: 'open_design_agent_turn',
    attributes: [['schema', OPEN_DESIGN_AGENT_TURN_SCHEMA_V1]],
    children: [
      {
        kind: 'text',
        tag: 'instructions',
        text: requireNonEmptyMarkdown(input.instructionsMarkdown, 'instructionsMarkdown'),
      },
      nullableMarkdownNode('attachments', input.attachmentsMarkdown),
      nullableMarkdownNode('context', input.contextMarkdown),
      lifecycleNode(input),
      userPromptNode(input.userFirstPrompt),
    ],
  };
}

/** Serialize one ordinary Agent turn to its single canonical encoding. */
export function serializeOpenDesignAgentTurnV1(input: OpenDesignAgentTurnV1): string {
  return serializeCanonicalXml(buildTree(input));
}

function assertNoAttributes(node: CanonicalXmlNode, field: string): void {
  if ((node.attributes?.length ?? 0) !== 0) {
    throw new TypeError(field + ' must not have attributes.');
  }
}

function readRequiredMarkdown(
  node: CanonicalXmlNode | undefined,
  field: string,
): string {
  const text = requireCanonicalXmlText(node, field);
  assertNoAttributes(text, field);
  return requireNonEmptyMarkdown(text.text, field);
}

function readNullableMarkdown(
  index: ReadonlyMap<string, CanonicalXmlNode>,
  tag: 'attachments' | 'context',
): string | null {
  const textNode = index.get(tag);
  const emptyNode = index.get(tag + '_empty');
  if (Boolean(textNode) === Boolean(emptyNode)) {
    throw new TypeError(tag + ' must contain exactly one text or empty marker slot.');
  }
  if (textNode) return readRequiredMarkdown(textNode, tag);
  if (emptyNode?.kind !== 'marker') {
    throw new TypeError(tag + '_empty must be a marker node.');
  }
  assertNoAttributes(emptyNode, tag + '_empty');
  return null;
}

function readLifecycle(
  index: ReadonlyMap<string, CanonicalXmlNode>,
): Pick<
  OpenDesignAgentTurnV1,
  'discoveryBootstrapMarkdown' | 'compactLifecycleCapsuleMarkdown'
> {
  const discovery = index.get('discovery_bootstrap');
  const capsule = index.get('compact_lifecycle_capsule');
  const empty = index.get('lifecycle_empty');
  const present = [discovery, capsule, empty].filter(Boolean);
  if (present.length !== 1) {
    throw new TypeError(
      'lifecycle must contain exactly one discovery bootstrap, compact capsule, or empty marker.',
    );
  }
  if (discovery) {
    return { discoveryBootstrapMarkdown: readRequiredMarkdown(discovery, 'discovery_bootstrap') };
  }
  if (capsule) {
    return {
      compactLifecycleCapsuleMarkdown: readRequiredMarkdown(
        capsule,
        'compact_lifecycle_capsule',
      ),
    };
  }
  if (empty?.kind !== 'marker') {
    throw new TypeError('lifecycle_empty must be a marker node.');
  }
  assertNoAttributes(empty, 'lifecycle_empty');
  return {};
}

/**
 * Parse an ordinary Agent turn and reject every byte sequence outside the v1
 * root, schema, slot order, slot kinds, and lifecycle exclusivity contract.
 */
export function parseOpenDesignAgentTurnV1(source: string): OpenDesignAgentTurnV1 {
  const root = requireCanonicalXmlElement(parseCanonicalXml(source), 'agent turn');
  if (root.tag !== 'open_design_agent_turn') {
    throw new TypeError('Agent turn root must be open_design_agent_turn.');
  }
  if (
    (root.attributes?.length ?? 0) !== 1
    || root.attributes?.[0]?.[0] !== 'schema'
    || requireCanonicalXmlAttribute(root, 'schema', 'agent turn')
      !== OPEN_DESIGN_AGENT_TURN_SCHEMA_V1
  ) {
    throw new TypeError('Agent turn schema is not ' + OPEN_DESIGN_AGENT_TURN_SCHEMA_V1 + '.');
  }

  const slots = indexCanonicalXmlChildren(root, TURN_SLOTS, 'agent turn');
  if (
    root.children.at(-1)?.tag !== 'user_first_prompt'
    && root.children.at(-1)?.tag !== 'user_first_prompt_empty'
  ) {
    throw new TypeError('The user prompt slot must be the last Agent turn slot.');
  }
  const userPrompt = slots.get('user_first_prompt');
  const emptyUserPrompt = slots.get('user_first_prompt_empty');
  if (Boolean(userPrompt) === Boolean(emptyUserPrompt)) {
    throw new TypeError('The user prompt must contain exactly one text or empty marker slot.');
  }
  if (emptyUserPrompt) {
    if (emptyUserPrompt.kind !== 'marker') {
      throw new TypeError('user_first_prompt_empty must be a marker node.');
    }
    assertNoAttributes(emptyUserPrompt, 'user_first_prompt_empty');
  }
  const parsed: OpenDesignAgentTurnV1 = {
    instructionsMarkdown: readRequiredMarkdown(slots.get('instructions'), 'instructions'),
    attachmentsMarkdown: readNullableMarkdown(slots, 'attachments'),
    contextMarkdown: readNullableMarkdown(slots, 'context'),
    ...readLifecycle(slots),
    userFirstPrompt: userPrompt
      ? readRequiredMarkdown(userPrompt, 'user_first_prompt')
      : '',
  };
  if (serializeOpenDesignAgentTurnV1(parsed) !== source) {
    throw new TypeError('Agent turn is not in canonical v1 form.');
  }
  return parsed;
}
