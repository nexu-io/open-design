// @vitest-environment jsdom
import { expect, it } from "vitest";
import { groupInfoFor } from "./timelineGroupInfo";

it("sees a group the preview adds, whichever window built its node", () => {
  const frame = document.body.appendChild(document.createElement("iframe"));
  const doc = frame.contentDocument!;
  const member = doc.createElement("audio");
  member.id = "a1";
  member.setAttribute("data-audio-group", "g1");
  doc.body.append(member);
  expect(groupInfoFor(doc, "g1").label).toBe("g1");
  const group = doc.createElement("hf-audio-group");
  group.id = "g1";
  group.setAttribute("data-label", "Drums");
  doc.body.append(group);

  expect(groupInfoFor(doc, "g1").label).toBe("Drums");
  frame.remove();
});
