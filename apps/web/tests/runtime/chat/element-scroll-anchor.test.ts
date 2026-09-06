// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  captureElementScrollAnchor,
  scrollTopForElementScrollAnchor,
} from '../../../src/runtime/chat/element-scroll-anchor';

function rect(top: number): DOMRect {
  return {
    top,
    bottom: top + 30,
    left: 0,
    right: 200,
    width: 200,
    height: 30,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('in-chat element scroll anchor', () => {
  it.each([
    ['Next', 'question-footer'],
    ['Back', 'question-footer'],
    ['own answer', 'question-own:tone'],
  ])('keeps the first visible message fixed when %s changes form height', (_label, anchorId) => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => rect(100);
    const message = document.createElement('div');
    message.dataset.assistantMessageId = 'assistant-1';
    message.getBoundingClientRect = () => ({
      ...rect(80),
      bottom: 360,
      height: 280,
    });
    const form = document.createElement('div');
    form.dataset.formId = 'brief';
    const localAnchor = document.createElement('div');
    localAnchor.dataset.chatScrollAnchor = anchorId;
    localAnchor.getBoundingClientRect = () => rect(310);
    const control = document.createElement('button');
    control.dataset.chatPreserveScrollAnchor = anchorId;
    localAnchor.append(control);
    form.append(localAnchor);
    message.append(form);
    container.append(message);
    document.body.append(container);
    container.scrollTop = 700;

    const snapshot = captureElementScrollAnchor(container, control);
    expect(snapshot).not.toBeNull();

    // The active step / own-answer row grew, but the message that was already
    // clipped at the top of the viewport did not move in content coordinates.
    // Keeping the clicked footer/row fixed would incorrectly add this 180px
    // local height delta to scrollTop and make that first visible message jump.
    localAnchor.getBoundingClientRect = () => rect(490);
    expect(scrollTopForElementScrollAnchor(container, snapshot!)).toBe(700);
    container.remove();
  });

  it('keeps a stepped form footer at the same viewport position after Next changes height', () => {
    const container = document.createElement('div');
    const form = document.createElement('div');
    form.dataset.formId = 'brief';
    const footer = document.createElement('div');
    footer.dataset.chatScrollAnchor = 'question-footer';
    footer.getBoundingClientRect = () => rect(310);
    const next = document.createElement('button');
    next.dataset.chatPreserveScrollAnchor = 'question-footer';
    footer.append(next);
    form.append(footer);
    container.append(form);
    document.body.append(container);
    container.scrollTop = 700;

    const snapshot = captureElementScrollAnchor(container, next);
    expect(snapshot).not.toBeNull();
    footer.getBoundingClientRect = () => rect(490);

    expect(scrollTopForElementScrollAnchor(container, snapshot!)).toBe(880);
    container.remove();
  });

  it('finds the replacement own-answer row instead of retaining a detached node', () => {
    const container = document.createElement('div');
    const form = document.createElement('div');
    form.dataset.formId = 'brief';
    const collapsed = document.createElement('button');
    collapsed.dataset.chatScrollAnchor = 'question-own:tone';
    collapsed.dataset.chatPreserveScrollAnchor = 'question-own:tone';
    collapsed.getBoundingClientRect = () => rect(220);
    form.append(collapsed);
    container.append(form);
    document.body.append(container);
    container.scrollTop = 500;

    const snapshot = captureElementScrollAnchor(container, collapsed);
    const expanded = document.createElement('div');
    expanded.dataset.chatScrollAnchor = 'question-own:tone';
    expanded.getBoundingClientRect = () => rect(260);
    collapsed.replaceWith(expanded);

    expect(scrollTopForElementScrollAnchor(container, snapshot!)).toBe(540);
    container.remove();
  });
});
