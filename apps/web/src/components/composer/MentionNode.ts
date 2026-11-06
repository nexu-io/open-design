import {
  TextNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
} from 'lexical';
import type { InlineMentionEntity, InlineMentionKind } from '../../utils/inlineMentions';
import { connectorBrandColor, resolveBrandTheme } from '../../utils/connectorBrandColor';

// The atomic @mention node. It extends TextNode so the node's *text* remains
// the literal `@token` and serialization back to the wire format is free:
// `getTextContent()` already yields `@token`. Lexical token mode deletes the
// node as one entity but still allows character-by-character caret navigation,
// so LexicalComposerInput adds explicit keyboard normalization for arrows.
type Kind = InlineMentionKind;

export interface MentionPayload {
  mentionId: string;
  mentionKind: Kind;
  token: string; // literal "@..." — this IS the node text
  label: string;
  title?: string | undefined;
}

export type SerializedMentionNode = Spread<
  {
    mentionId: string;
    mentionKind: Kind;
    token: string;
    label: string;
    title?: string;
  },
  SerializedTextNode
>;

export class MentionNode extends TextNode {
  __mentionId: string;
  __mentionKind: Kind;
  __token: string;
  __label: string;
  __title: string | undefined;

  static getType(): string {
    return 'composer-mention';
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(
      {
        mentionId: node.__mentionId,
        mentionKind: node.__mentionKind,
        token: node.__token,
        label: node.__label,
        title: node.__title,
      },
      node.__text,
      node.__key,
    );
  }

  constructor(p: MentionPayload, text?: string, key?: NodeKey) {
    super(text ?? p.token, key); // node TEXT = token → serializes verbatim
    this.__mentionId = p.mentionId;
    this.__mentionKind = p.mentionKind;
    this.__token = p.token;
    this.__label = p.label;
    this.__title = p.title;
    // NOTE: token mode is applied in $createMentionNode, NOT here. Calling
    // this.setMode('token') in the constructor recurses to a stack overflow:
    // setMode → getWritable → (for an existing node) clone() → new
    // MentionNode → setMode → … This crashed on every mention delete/select
    // (where Lexical clones the node via getWritable). Lexical's clone
    // protocol copies __mode from the previous node in TextNode.afterCloneFrom,
    // so clones preserve token mode without re-running setMode.
  }

  getEntity(): InlineMentionEntity {
    return {
      id: this.__mentionId,
      kind: this.__mentionKind,
      label: this.__label,
      token: this.__token,
      ...(this.__title ? { title: this.__title } : {}),
    };
  }

  getToken(): string {
    return this.__token;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config); // <span> wrapping the token text
    dom.className = `composer-inline-mention composer-inline-mention--${this.__mentionKind}`;
    dom.contentEditable = 'false';
    dom.setAttribute('contenteditable', 'false');
    dom.setAttribute('data-mention', '');
    dom.setAttribute('data-mention-id', this.__mentionId);
    dom.setAttribute('data-mention-kind', this.__mentionKind);
    // Stamp the label so the live-theme observer can recompute a connector's
    // brand hue from the mounted DOM alone, without a handle back to the node.
    dom.setAttribute('data-mention-label', this.__label);
    if (this.__title) dom.setAttribute('title', this.__title);
    this.applyBrandHue(dom);
    return dom;
  }

  updateDOM(prev: this, dom: HTMLElement, config: EditorConfig): boolean {
    // `TextNode.updateDOM` declares its previous-node param with a polymorphic
    // `this`. Match that signature exactly so the override is type-compatible;
    // inside MentionNode `this` is MentionNode, so the `__mention*` reads below
    // are still well typed.
    const updated = super.updateDOM(prev, dom, config);
    if (prev.__mentionKind !== this.__mentionKind) {
      dom.className = `composer-inline-mention composer-inline-mention--${this.__mentionKind}`;
      dom.setAttribute('data-mention-kind', this.__mentionKind);
      this.applyBrandHue(dom);
    } else if (prev.__label !== this.__label || prev.__mentionId !== this.__mentionId) {
      this.applyBrandHue(dom);
    }
    if (prev.__label !== this.__label) {
      dom.setAttribute('data-mention-label', this.__label);
    }
    if (prev.__title !== this.__title) {
      if (this.__title) dom.setAttribute('title', this.__title);
      else dom.removeAttribute('title');
    }
    return updated;
  }

  // Connector pills get a per-connector brand color instead of the shared
  // green `--m-hue`, so e.g. Notion reads black and Figma purple. The hue is
  // resolved against the live theme so near-black brands stay readable in dark
  // mode (see connectorBrandColor). Other kinds keep their CSS-driven hue (we
  // clear any stale inline value). The hue depends on the live theme, so any
  // mounted connector pill is re-stamped by the theme observer below when the
  // document theme (or OS `prefers-color-scheme`) flips.
  private applyBrandHue(dom: HTMLElement): void {
    if (this.__mentionKind === 'connector') {
      applyConnectorBrandHue(dom, this.__mentionId, this.__label);
      ensureConnectorThemeObserver();
    } else {
      dom.style.removeProperty('--m-hue');
    }
  }

  // Token mode keeps the mention indivisible. Text must still be insertable on
  // either side as sibling text nodes so users can click/arrow around a pill
  // and continue writing inline.
  isToken(): true {
    return true;
  }

  exportJSON(): SerializedMentionNode {
    return {
      ...super.exportJSON(),
      type: MentionNode.getType(),
      version: 1,
      mentionId: this.__mentionId,
      mentionKind: this.__mentionKind,
      token: this.__token,
      label: this.__label,
      ...(this.__title ? { title: this.__title } : {}),
    };
  }

  static importJSON(json: SerializedMentionNode): MentionNode {
    return $createMentionNode({
      mentionId: json.mentionId,
      mentionKind: json.mentionKind,
      token: json.token,
      label: json.label,
      title: json.title,
    });
  }
}

export function $createMentionNode(p: MentionPayload): MentionNode {
  // setMode here (on a freshly-created node, before it is cloned) is safe:
  // getWritable returns the node itself, so there is no clone recursion. All
  // later clones inherit the mode via TextNode.afterCloneFrom. Keep token
  // mode out of the constructor (see the note there).
  const node = new MentionNode(p);
  node.setMode('token'); // atomic: single caret stop, whole-node delete
  return node;
}

export function $isMentionNode(n: LexicalNode | null | undefined): n is MentionNode {
  return n instanceof MentionNode;
}

// Compute and stamp a connector pill's brand `--m-hue` against the live theme.
// Shared by MentionNode.createDOM/updateDOM (initial render) and the theme
// observer below (live re-stamp), so both paths resolve the hue identically.
function applyConnectorBrandHue(dom: HTMLElement, id: string, label: string): void {
  const hue = connectorBrandColor({ id, name: label }, resolveBrandTheme());
  dom.style.setProperty('--m-hue', hue);
}

// `applyBrandHue` only runs when Lexical creates or mutates the node, so a
// connector pill mounted in light mode keeps its near-black light hue after a
// live theme switch — unreadable dark-on-dark text in dark mode. Watch the
// document `data-theme` attribute and the OS `prefers-color-scheme` (matching
// ConnectorLogo.useResolvedTheme) and re-stamp every mounted connector pill so
// existing pills stay readable when the theme flips. Idempotent and lazy: the
// observer is installed once, on first connector render, and reads everything
// it needs from the DOM (`data-mention-id` / `data-mention-label`).
let themeObserverInstalled = false;

function restampMountedConnectorPills(): void {
  if (typeof document === 'undefined') return;
  const pills = document.querySelectorAll<HTMLElement>(
    '.composer-inline-mention--connector[data-mention-id]',
  );
  pills.forEach((pill) => {
    applyConnectorBrandHue(
      pill,
      pill.getAttribute('data-mention-id') ?? '',
      pill.getAttribute('data-mention-label') ?? '',
    );
  });
}

function ensureConnectorThemeObserver(): void {
  if (themeObserverInstalled || typeof document === 'undefined') return;
  themeObserverInstalled = true;
  const observer = new MutationObserver(restampMountedConnectorPills);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  if (typeof window !== 'undefined' && window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener?.('change', restampMountedConnectorPills);
  }
}
