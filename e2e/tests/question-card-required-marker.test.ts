import { test, expect } from '@playwright/test';

const questionFormCss = `
.question-form-row {
  display: flex;
  align-items: flex-start;
  min-width: 0;
  max-width: 100%;
}

.qf-label {
  min-width: 0;
  flex: 1 1 auto;
  overflow-wrap: anywhere;
  line-height: 20px;
}

.qf-required {
  flex: 0 0 auto;
  white-space: nowrap;
  line-height: 20px;
}

.qf-required,
.qf-required > span,
.qf-required > button,
.qf-required button {
  white-space: nowrap;
}
`;

const longLabel = 'Please confirm the generated deployment includes the following extremely long unbreakable reference https://example.invalid/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa and มาตรฐานภาษาไทยที่มีข้อความยาวมากเพื่อให้ตรวจสอบการตัดบรรทัดในแชท';

test.describe('Question card required marker', () => {
  test('stays single-line and avoids horizontal overflow in narrow chat pane', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await page.setContent(`<!doctype html>
<html>
  <head>
    <meta charset='utf-8' />
    <style>${questionFormCss}</style>
    <style>
      body { margin: 0; }
      .chat-pane { width: 100%; padding: 12px; box-sizing: border-box; }
      .question-card { border: 1px solid #999; padding: 12px; box-sizing: border-box; }
      .qf-required button { border: 1px solid #999; border-radius: 999px; padding: 0 8px; font: inherit; }
    </style>
  </head>
  <body>
    <main class='chat-pane'>
      <section class='question-card'>
        <div class='question-form-row'>
          <label class='qf-label' for='q1'>${longLabel}</label>
          <span class='qf-required'><button id='q1' type='button'>Required</button></span>
        </div>
      </section>
    </main>
  </body>
</html>`);

    const row = page.locator('.question-form-row');
    const marker = page.locator('.qf-required');
    const markerButton = marker.locator('button');

    await expect(marker).toHaveCSS('white-space', 'nowrap');
    await expect(markerButton).toHaveCSS('white-space', 'nowrap');

    const metrics = await marker.evaluate((el) => {
      const computed = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const childRects = Array.from(el.children).map((child) => child.getBoundingClientRect());
      const rowEl = el.closest('.question-form-row');
      const cardEl = rowEl ? rowEl.closest('.question-card') : null;
      const labelEl = rowEl ? rowEl.querySelector('.qf-label') : null;

      return {
        lineHeight: computed.lineHeight,
        fontSize: computed.fontSize,
        markerHeight: rect.height,
        childHeights: childRects.map((childRect) => childRect.height),
        labelHeight: labelEl ? labelEl.getBoundingClientRect().height : 0,
        rowScrollWidth: rowEl ? rowEl.scrollWidth : 0,
        rowClientWidth: rowEl ? rowEl.clientWidth : 0,
        rowWidth: rowEl ? rowEl.getBoundingClientRect().width : 0,
        cardScrollWidth: cardEl ? cardEl.scrollWidth : 0,
        cardClientWidth: cardEl ? cardEl.clientWidth : 0
      };
    });

    let lineHeight = Number.parseFloat(metrics.lineHeight);
    if (Number.isNaN(lineHeight)) {
      lineHeight = Number.parseFloat(metrics.fontSize) * 1.2;
    }

    const maxSingleLineHeight = lineHeight * 1.25;

    expect(metrics.markerHeight).toBeLessThanOrEqual(maxSingleLineHeight);
    for (const childHeight of metrics.childHeights) {
      expect(childHeight).toBeLessThanOrEqual(maxSingleLineHeight);
    }

    expect(metrics.labelHeight).toBeGreaterThan(lineHeight * 1.5);
    expect(metrics.rowScrollWidth).toBeLessThanOrEqual(metrics.rowClientWidth);
    expect(metrics.cardScrollWidth).toBeLessThanOrEqual(metrics.cardClientWidth);
    expect(metrics.rowWidth).toBeLessThanOrEqual(320);

    const rowBox = await row.boundingBox();
    expect(rowBox).not.toBeNull();
    if (rowBox) {
      expect(rowBox.width).toBeLessThanOrEqual(320);
    }
  });
});
