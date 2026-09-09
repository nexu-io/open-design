import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
  PACKAGED_HOME_FIRST_RUN_PROMPT,
  packagedHomeFirstRunExpression,
  waitForPackagedHomeFirstRunSetup,
} from '@/vitest/packaged-home-first-run';

class FixtureElement {
  __lexicalEditor?: {
    parseEditorState(value: string): unknown;
    setEditorState(value: unknown): void;
  };

  isContentEditable = false;
  textContent = '';

  constructor(private readonly visible = true) {}

  focus(): void {}

  getClientRects(): ArrayLike<unknown> {
    return this.visible ? [{}] : [];
  }
}

type FixtureDocumentOptions = {
  composerAfterQueries?: number;
  composerContentEditable?: boolean;
  composerVisible?: boolean;
  editorAfterQueries?: number;
  loadingVisible?: boolean;
  onboardingVisible?: boolean;
  promptInsertionFailures?: number;
};

function renderFixture(options: FixtureDocumentOptions = {}) {
  const input = new FixtureElement(options.composerVisible ?? true);
  input.isContentEditable = options.composerContentEditable ?? true;
  let promptInsertionFailures = options.promptInsertionFailures ?? 0;
  const editor = {
    parseEditorState: (value: string) => JSON.parse(value),
    setEditorState: (value: unknown) => {
      if (promptInsertionFailures > 0) {
        promptInsertionFailures -= 1;
        throw new Error('fixture prompt insertion failed');
      }
      const root = value as {
        root?: { children?: Array<{ children?: Array<{ text?: string }> }> };
      };
      input.textContent = root.root?.children?.[0]?.children?.[0]?.text ?? '';
    },
  };
  if (options.editorAfterQueries == null) input.__lexicalEditor = editor;

  const loading = options.loadingVisible ? new FixtureElement() : null;
  const onboarding = options.onboardingVisible ? new FixtureElement() : null;
  let composerQueries = 0;

  return {
    document: {
      addEventListener: () => undefined,
      querySelector: (selector: string) => {
        if (selector === '[data-testid="home-hero-input"]') {
          composerQueries += 1;
          if (composerQueries > (options.editorAfterQueries ?? Number.POSITIVE_INFINITY)) {
            input.__lexicalEditor = editor;
          }
          return composerQueries > (options.composerAfterQueries ?? 0) ? input : null;
        }
        if (selector === '.od-loading-shell, .centered-loader') return loading;
        if (selector === '.entry-shell--onboarding, .entry-onboarding-modal') return onboarding;
        return null;
      },
    },
    input,
    composerQueries: () => composerQueries,
  };
}

function createExpressionEvaluator(
  fixture: ReturnType<typeof renderFixture>,
  pathname = '/',
) {
  const sandbox = {
    document: fixture.document,
    Element: FixtureElement,
    HTMLElement: FixtureElement,
    Headers,
    location: { href: `od://app${pathname}`, pathname },
    performance: {
      getEntriesByType: () => [{}],
      timeOrigin: 1234,
    },
    Request,
    Response,
    fetch: async () => new Response('{}', { status: 200 }),
    setTimeout,
  };
  return async (expression: string): Promise<unknown> => {
    return await runInNewContext(expression, sandbox);
  };
}

async function evaluateExpression(
  expression: string,
  fixture: ReturnType<typeof renderFixture>,
  pathname = '/',
): Promise<unknown> {
  return await createExpressionEvaluator(fixture, pathname)(expression);
}

describe('packaged Home first-run readiness', () => {
  it('returns quickly until a later inspection can instrument the ready composer', async () => {
    const fixture = renderFixture({ composerAfterQueries: 2, loadingVisible: true });

    const first = await evaluateExpression(packagedHomeFirstRunExpression(), fixture);
    const second = await evaluateExpression(packagedHomeFirstRunExpression(), fixture);
    const ready = await evaluateExpression(packagedHomeFirstRunExpression(), fixture);

    expect(first).toMatchObject({
      instrumented: false,
      readiness: { composerFound: false, composerVisible: false },
    });
    expect(second).toMatchObject({
      instrumented: false,
      readiness: { composerFound: false, composerVisible: false },
    });
    expect(fixture.composerQueries()).toBe(4);
    expect(fixture.input.textContent).toBe(PACKAGED_HOME_FIRST_RUN_PROMPT);
    expect(ready).toMatchObject({
      instrumented: true,
      inputTextBeforeSubmit: PACKAGED_HOME_FIRST_RUN_PROMPT,
      submitClicked: false,
    });
  });

  it('polls through separate inspections until the composer can be instrumented', async () => {
    const fixture = renderFixture({ composerAfterQueries: 2, loadingVisible: true });
    let inspectionCount = 0;

    const setup = await waitForPackagedHomeFirstRunSetup(async () => {
      inspectionCount += 1;
      return await evaluateExpression(packagedHomeFirstRunExpression(), fixture);
    }, { pollIntervalMs: 0, timeoutMs: 100 });

    expect(inspectionCount).toBe(3);
    expect(setup).toMatchObject({
      instrumented: true,
      inputTextBeforeSubmit: PACKAGED_HOME_FIRST_RUN_PROMPT,
    });
  });

  it('waits for Lexical attachment without persisting a poisoned setup', async () => {
    const fixture = renderFixture({ editorAfterQueries: 2 });
    const evaluate = createExpressionEvaluator(fixture);

    const first = await evaluate(packagedHomeFirstRunExpression());
    const second = await evaluate(packagedHomeFirstRunExpression());
    const ready = await evaluate(packagedHomeFirstRunExpression());

    expect(first).toMatchObject({
      instrumented: false,
      readiness: { lexicalEditorReady: false },
    });
    expect(second).toMatchObject({
      instrumented: false,
      readiness: { lexicalEditorReady: false },
    });
    expect(ready).toMatchObject({
      instrumented: true,
      inputTextBeforeSubmit: PACKAGED_HOME_FIRST_RUN_PROMPT,
      readiness: { lexicalEditorReady: true },
    });
  });

  it('retries prompt insertion without accepting provisional success state', async () => {
    const fixture = renderFixture({ promptInsertionFailures: 1 });
    const evaluate = createExpressionEvaluator(fixture);
    let inspectionCount = 0;

    const setup = await waitForPackagedHomeFirstRunSetup(async () => {
      inspectionCount += 1;
      return await evaluate(packagedHomeFirstRunExpression());
    }, { pollIntervalMs: 0, timeoutMs: 100 });

    expect(inspectionCount).toBe(2);
    expect(fixture.input.textContent).toBe(PACKAGED_HOME_FIRST_RUN_PROMPT);
    expect(setup.inputTextBeforeSubmit).toBe(PACKAGED_HOME_FIRST_RUN_PROMPT);
  });

  it('reports why the current composer is not ready without blocking the inspection', async () => {
    const fixture = renderFixture({
      composerContentEditable: false,
      composerVisible: false,
      loadingVisible: true,
      onboardingVisible: true,
    });
    const value = await evaluateExpression(
      packagedHomeFirstRunExpression(),
      fixture,
      '/onboarding',
    );

    expect(value).toMatchObject({
      instrumented: false,
      readiness: {
        pathname: '/onboarding',
        loadingVisible: true,
        onboardingVisible: true,
        composerFound: true,
        composerVisible: false,
        composerContentEditable: false,
      },
    });
  });

  it('times out with the final readiness snapshot when no inspection can instrument', async () => {
    const fixture = renderFixture({
      composerContentEditable: false,
      composerVisible: false,
      loadingVisible: true,
      onboardingVisible: true,
    });
    let inspectionCount = 0;

    const setup = waitForPackagedHomeFirstRunSetup(async () => {
      inspectionCount += 1;
      return await evaluateExpression(
        packagedHomeFirstRunExpression(),
        fixture,
        '/onboarding',
      );
    }, { pollIntervalMs: 1, timeoutMs: 10 });

    await expect(setup).rejects.toThrow(
      /pathname.*\/onboarding.*loadingVisible.*true.*onboardingVisible.*true.*composerFound.*true.*composerVisible.*false.*composerContentEditable.*false/s,
    );
    expect(inspectionCount).toBeGreaterThan(1);
  });
});
