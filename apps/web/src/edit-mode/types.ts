export type ManualEditKind = 'text' | 'link' | 'image' | 'container' | 'token';

export interface ManualEditRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManualEditFields {
  text?: string;
  href?: string;
  src?: string;
  alt?: string;
}

export interface ManualEditStyles {
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontWeight: string;
  textAlign: string;
  padding: string;
  margin: string;
  borderRadius: string;
  border: string;
  width: string;
  minHeight: string;
}

export interface ManualEditTarget {
  id: string;
  kind: ManualEditKind;
  label: string;
  tagName: string;
  className: string;
  text: string;
  rect: ManualEditRect;
  fields: ManualEditFields;
  attributes: Record<string, string>;
  styles: ManualEditStyles;
  outerHtml: string;
}

export type ManualEditPatch =
  | { id: string; kind: 'set-text'; value: string }
  | { id: string; kind: 'set-link'; text: string; href: string }
  | { id: string; kind: 'set-image'; src: string; alt: string }
  | { kind: 'set-token'; token: string; value: string }
  | { id: string; kind: 'set-style'; styles: Partial<ManualEditStyles> }
  | { id: string; kind: 'set-attributes'; attributes: Record<string, string> }
  | { id: string; kind: 'set-outer-html'; html: string }
  | { kind: 'set-full-source'; source: string };

export interface ManualEditHistoryEntry {
  id: string;
  label: string;
  patch: ManualEditPatch;
  beforeSource: string;
  afterSource: string;
  createdAt: number;
}

export interface ManualEditTargetMessage {
  type: 'od-edit-targets';
  targets: ManualEditTarget[];
}

export interface ManualEditSelectMessage {
  type: 'od-edit-select';
  target: ManualEditTarget;
}

export type ManualEditBridgeMessage = ManualEditTargetMessage | ManualEditSelectMessage;

export function emptyManualEditStyles(): ManualEditStyles {
  return {
    color: '',
    backgroundColor: '',
    fontSize: '',
    fontWeight: '',
    textAlign: '',
    padding: '',
    margin: '',
    borderRadius: '',
    border: '',
    width: '',
    minHeight: '',
  };
}
