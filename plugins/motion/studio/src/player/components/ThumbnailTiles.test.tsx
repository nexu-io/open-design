// @vitest-environment happy-dom
import { act } from "react";
import { expect, it } from "vitest";
import { createHappyDomRootHarness } from "./testRootHarness";
import { ThumbnailTiles } from "./ThumbnailTiles";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const harness = createHappyDomRootHarness();

it("places the first mounted tile where the full strip would have it", () => {
  const host = document.body.appendChild(document.createElement("div"));
  act(() =>
    harness.mount(host).render(
      <ThumbnailTiles
        strip={{ width: 10_000, height: 40, inViewStart: 1_024, inViewEnd: 2_048 }}
        frameW={100}
        frameCount={100}
        watchGap={() => {}}
      >
        {(index) => <i key={index} data-index={index} />}
      </ThumbnailTiles>,
    ),
  );

  const row = host.firstElementChild as HTMLElement;
  const first = Number(row.querySelector("i")!.dataset.index);
  expect(first).toBe(10);
  expect(row.style.paddingLeft).toBe(`${first * 100}px`);
});
