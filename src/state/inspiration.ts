import type { InspirationBoard, InspirationPin } from '../types';

const BOARDS_KEY = 'oneshot:inspiration-boards';
const PINS_KEY = 'oneshot:inspiration-pins';
const CHANGE_EVENT = 'oneshot:inspiration-changed';
const EXPORT_SCHEMA = 'oneshot.inspiration-board.v1';

export interface InspirationBoardExport {
  schema: typeof EXPORT_SCHEMA;
  exportedAt: number;
  board: InspirationBoard;
  pins: InspirationPin[];
}

const DEFAULT_BOARDS: InspirationBoard[] = [
  {
    id: 'cover-vision-references',
    title: 'CoverVision references',
    description: 'Book-cover comps, typography, palette, and genre signals.',
    tags: ['covers', 'publishing', 'typography'],
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'ios-26-liquid-glass',
    title: 'iOS 26 Liquid Glass',
    description: 'App surfaces, controls, widgets, and glass hierarchy references.',
    tags: ['ios', 'mobile', 'glass'],
    createdAt: 2,
    updatedAt: 2,
  },
];

const DEFAULT_PINS: InspirationPin[] = [
  {
    id: 'cover-vision-layout-notes',
    boardId: 'cover-vision-references',
    title: 'Cover run reference packet',
    imageUrl: '',
    sourceUrl: '',
    note: 'Use this board for genre comps, type hierarchy, palette, and print-readiness notes.',
    usageNote: 'Reference only. Confirm source rights before using any image directly.',
    tags: ['brief', 'qa'],
    createdAt: 1,
  },
  {
    id: 'ios-26-glass-notes',
    boardId: 'ios-26-liquid-glass',
    title: 'Liquid Glass reference set',
    imageUrl: '',
    sourceUrl: 'design-systems/ios-26-liquid-glass/assets/reference-prototype.html',
    note: 'Track glass tiers, tab chrome, modal sheets, widgets, and reduced-brightness behavior.',
    usageNote: 'Internal design reference for OneShot iOS 26 prototypes.',
    tags: ['reference', 'prototype'],
    createdAt: 2,
  },
];

export function listInspirationBoards(): InspirationBoard[] {
  const stored = readArray<InspirationBoard>(BOARDS_KEY);
  return (hasStoredValue(BOARDS_KEY) ? stored : DEFAULT_BOARDS)
    .filter((board) => board && typeof board.id === 'string')
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function listInspirationPins(): InspirationPin[] {
  const stored = readArray<InspirationPin>(PINS_KEY);
  return (hasStoredValue(PINS_KEY) ? stored : DEFAULT_PINS)
    .filter((pin) => pin && typeof pin.id === 'string')
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function createInspirationBoard(input: {
  title: string;
  description?: string;
  tags?: string[];
}): InspirationBoard {
  const now = Date.now();
  const board: InspirationBoard = {
    id: `board-${now}-${slugify(input.title) || crypto.randomUUID()}`,
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };
  localStorage.setItem(BOARDS_KEY, JSON.stringify([board, ...listInspirationBoards()]));
  emitChange();
  return board;
}

export function updateInspirationBoard(id: string, input: {
  title?: string;
  description?: string;
  tags?: string[];
}): InspirationBoard | null {
  const now = Date.now();
  let updated: InspirationBoard | null = null;
  const next = listInspirationBoards().map((board) => {
    if (board.id !== id) return board;
    updated = {
      ...board,
      title: input.title?.trim() || board.title,
      description: input.description?.trim() ?? board.description,
      tags: input.tags ?? board.tags,
      updatedAt: now,
    };
    return updated;
  });
  if (!updated) return null;
  localStorage.setItem(BOARDS_KEY, JSON.stringify(next));
  emitChange();
  return updated;
}

export function deleteInspirationBoard(id: string): void {
  localStorage.setItem(
    BOARDS_KEY,
    JSON.stringify(listInspirationBoards().filter((board) => board.id !== id)),
  );
  localStorage.setItem(
    PINS_KEY,
    JSON.stringify(listInspirationPins().filter((pin) => pin.boardId !== id)),
  );
  emitChange();
}

export function exportInspirationBoard(id: string): InspirationBoardExport | null {
  const board = listInspirationBoards().find((entry) => entry.id === id);
  if (!board) return null;
  return {
    schema: EXPORT_SCHEMA,
    exportedAt: Date.now(),
    board,
    pins: listInspirationPins().filter((pin) => pin.boardId === id),
  };
}

export function importInspirationBoard(payload: unknown): InspirationBoard | null {
  const packet = normalizeBoardExport(payload);
  if (!packet) return null;
  const now = Date.now();
  const existingBoardIds = new Set(listInspirationBoards().map((board) => board.id));
  const boardId = existingBoardIds.has(packet.board.id)
    ? `board-${now}-${slugify(packet.board.title) || crypto.randomUUID()}`
    : packet.board.id;
  const board: InspirationBoard = {
    ...packet.board,
    id: boardId,
    createdAt: Number.isFinite(packet.board.createdAt) ? packet.board.createdAt : now,
    updatedAt: now,
  };
  const importedPins: InspirationPin[] = packet.pins.map((pin, index) => ({
    ...pin,
    id: `pin-${now}-${index}-${slugify(pin.title) || crypto.randomUUID()}`,
    boardId,
    createdAt: Number.isFinite(pin.createdAt) ? pin.createdAt : now + index,
  }));

  localStorage.setItem(BOARDS_KEY, JSON.stringify([board, ...listInspirationBoards()]));
  localStorage.setItem(PINS_KEY, JSON.stringify([...importedPins, ...listInspirationPins()]));
  emitChange();
  return board;
}

export function createInspirationPin(input: {
  boardId: string;
  title: string;
  imageUrl?: string;
  sourceUrl?: string;
  note?: string;
  usageNote?: string;
  tags?: string[];
}): InspirationPin {
  const now = Date.now();
  const pin: InspirationPin = {
    id: `pin-${now}-${slugify(input.title) || crypto.randomUUID()}`,
    boardId: input.boardId,
    title: input.title.trim(),
    imageUrl: input.imageUrl?.trim() ?? '',
    sourceUrl: input.sourceUrl?.trim() ?? '',
    note: input.note?.trim() ?? '',
    usageNote: input.usageNote?.trim() ?? '',
    tags: input.tags ?? [],
    createdAt: now,
  };
  localStorage.setItem(PINS_KEY, JSON.stringify([pin, ...listInspirationPins()]));
  touchBoard(input.boardId, now);
  emitChange();
  return pin;
}

export function updateInspirationPin(id: string, input: {
  title?: string;
  imageUrl?: string;
  sourceUrl?: string;
  note?: string;
  usageNote?: string;
  tags?: string[];
}): InspirationPin | null {
  const now = Date.now();
  let updated: InspirationPin | null = null;
  const next = listInspirationPins().map((pin) => {
    if (pin.id !== id) return pin;
    updated = {
      ...pin,
      title: input.title?.trim() || pin.title,
      imageUrl: input.imageUrl?.trim() ?? pin.imageUrl,
      sourceUrl: input.sourceUrl?.trim() ?? pin.sourceUrl,
      note: input.note?.trim() ?? pin.note,
      usageNote: input.usageNote?.trim() ?? pin.usageNote,
      tags: input.tags ?? pin.tags,
    };
    touchBoard(pin.boardId, now);
    return updated;
  });
  if (!updated) return null;
  localStorage.setItem(PINS_KEY, JSON.stringify(next));
  emitChange();
  return updated;
}

export function deleteInspirationPin(id: string): void {
  const existing = listInspirationPins().find((pin) => pin.id === id);
  localStorage.setItem(PINS_KEY, JSON.stringify(listInspirationPins().filter((pin) => pin.id !== id)));
  if (existing) touchBoard(existing.boardId, Date.now());
  emitChange();
}

export function buildInspirationPrompt(board: InspirationBoard, pins: InspirationPin[]): string {
  const lines = [
    `Use the OneShot inspiration board: ${board.title}.`,
    board.description ? `Board purpose: ${board.description}.` : '',
    board.tags.length > 0 ? `Board tags: ${board.tags.join(', ')}.` : '',
    '',
    'Reference pins:',
  ].filter(Boolean);
  pins.forEach((pin, index) => {
    lines.push(`${index + 1}. ${pin.title}`);
    if (pin.sourceUrl) lines.push(`   Source: ${pin.sourceUrl}`);
    if (pin.note) lines.push(`   Notes: ${pin.note}`);
    if (pin.usageNote) lines.push(`   Usage: ${pin.usageNote}`);
    if (pin.tags.length > 0) lines.push(`   Tags: ${pin.tags.join(', ')}`);
  });
  lines.push('');
  lines.push('Create a professional design brief from these references. Extract visual direction, palette, typography, layout patterns, risks, usage constraints, and a production-ready prompt packet.');
  return lines.join('\n');
}

export function parseTags(value: string): string[] {
  const tags = value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
  return Array.from(new Set(tags));
}

function touchBoard(id: string, updatedAt: number) {
  const next = listInspirationBoards().map((board) =>
    board.id === id ? { ...board, updatedAt } : board,
  );
  localStorage.setItem(BOARDS_KEY, JSON.stringify(next));
}

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function hasStoredValue(key: string) {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function normalizeBoardExport(payload: unknown): InspirationBoardExport | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Partial<InspirationBoardExport>;
  if (candidate.schema !== EXPORT_SCHEMA || !candidate.board || typeof candidate.board !== 'object') return null;
  const boardInput = candidate.board as Partial<InspirationBoard>;
  const title = typeof boardInput.title === 'string' ? boardInput.title.trim() : '';
  if (!title) return null;
  const id = typeof boardInput.id === 'string' && boardInput.id.trim()
    ? boardInput.id.trim()
    : `board-${Date.now()}-${slugify(title) || crypto.randomUUID()}`;
  const pinsInput = Array.isArray(candidate.pins) ? candidate.pins : [];
  return {
    schema: EXPORT_SCHEMA,
    exportedAt: typeof candidate.exportedAt === 'number' ? candidate.exportedAt : Date.now(),
    board: {
      id,
      title,
      description: typeof boardInput.description === 'string' ? boardInput.description : '',
      tags: normalizeTags(boardInput.tags),
      createdAt: typeof boardInput.createdAt === 'number' ? boardInput.createdAt : Date.now(),
      updatedAt: typeof boardInput.updatedAt === 'number' ? boardInput.updatedAt : Date.now(),
    },
    pins: pinsInput
      .map((pinInput, index) => normalizePin(pinInput, id, index))
      .filter((pin): pin is InspirationPin => Boolean(pin)),
  };
}

function normalizePin(input: unknown, boardId: string, index: number): InspirationPin | null {
  if (!input || typeof input !== 'object') return null;
  const pinInput = input as Partial<InspirationPin>;
  const title = typeof pinInput.title === 'string' ? pinInput.title.trim() : '';
  if (!title) return null;
  return {
    id: typeof pinInput.id === 'string' && pinInput.id.trim()
      ? pinInput.id.trim()
      : `pin-${Date.now()}-${index}-${slugify(title) || crypto.randomUUID()}`,
    boardId,
    title,
    imageUrl: typeof pinInput.imageUrl === 'string' ? pinInput.imageUrl : '',
    sourceUrl: typeof pinInput.sourceUrl === 'string' ? pinInput.sourceUrl : '',
    note: typeof pinInput.note === 'string' ? pinInput.note : '',
    usageNote: typeof pinInput.usageNote === 'string' ? pinInput.usageNote : '',
    tags: normalizeTags(pinInput.tags),
    createdAt: typeof pinInput.createdAt === 'number' ? pinInput.createdAt : Date.now() + index,
  };
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

function emitChange() {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
