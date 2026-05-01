import type { InspirationBoard, InspirationPin } from '../types';

const BOARDS_KEY = 'oneshot:inspiration-boards';
const PINS_KEY = 'oneshot:inspiration-pins';
const CHANGE_EVENT = 'oneshot:inspiration-changed';

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
