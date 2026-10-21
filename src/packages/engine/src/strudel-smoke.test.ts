import { test, expect } from "vitest";
import { mini } from "@strudel/mini";
import { arrange, silence } from "@strudel/core";
import { transpiler } from "@strudel/transpiler";
test("pinned Strudel packages load and query under Vitest", () => {
  expect(mini("bd*4").queryArc(0, 1).length).toBe(4);
  expect(arrange([1, silence], [1, mini("bd*2")]).queryArc(0, 2).length).toBe(2);
  expect(transpiler('$: s("bd")').output).toContain(".p(");
});
