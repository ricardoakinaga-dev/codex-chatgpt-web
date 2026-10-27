import { expect, test } from "bun:test";
import { chatGptModelFamilyMatches, selectChatGptModelFamily } from "../src/adapters/chatgpt-web/model-selection";
import { chatGptUsageModelFromAnnouncements } from "../src/adapters/chatgpt-web/limits";

test("model selection recognizes Latest in the launcher languages without accepting other model names", async () => {
  for (const [label, accepted] of [
    // pt-BR picker observed 2026-09-24: Recente / GPT-5.6 Sol / GPT-5.5.
    ["Latest", true], ["Recente", true], ["最新", true], ["최신", true], ["GPT-6 Pro", true], ["6", true],
    ["GPT-5.6 Sol", false], ["GPT-7 Pro", false], ["Latest preview", false], ["Recente preview", false],
  ] as const) {
    const menu = { menu: {
      getByRole: (_role: string, options: { name: RegExp }) => ({
        count: async () => options.name.test(label) ? 1 : 0,
        getAttribute: async () => "true",
        waitFor: async () => { throw new Error("Requested family is absent"); },
      }),
      locator: () => ({ count: async () => 1, getAttribute: async () => "true" }),
    } } as unknown as Parameters<typeof selectChatGptModelFamily>[0];
    const selection = selectChatGptModelFamily(menu, "6", async () => menu);
    if (accepted) expect(await selection).toBe(menu);
    else await expect(selection).rejects.toThrow("could not be selected and verified");
  }
});

test("family confirmation verifies the exact Sol or Pro version, including the old Latest picker", () => {
  expect(chatGptModelFamilyMatches(["5.6 High, 3 of 5."], "5.6", "high")).toBe(true);
  expect(chatGptModelFamilyMatches(["5.6 Extra High, 4 of 5."], "6", "xhigh")).toBe(false);
  expect(chatGptModelFamilyMatches(["6 Medium, 2 of 3.", "Medium"], "6", "medium")).toBe(true);
  expect(chatGptModelFamilyMatches(["GPT-6 Sol Extra High, 4 of 5."], "6", "xhigh")).toBe(true);
  expect(chatGptModelFamilyMatches(["GPT-6 Astra High, 3 of 5."], "6", "high")).toBe(false);
  expect(chatGptModelFamilyMatches(["6.1 High, 3 of 5."], "6", "high")).toBe(false);
  expect(chatGptModelFamilyMatches(["6 Pro, 5 of 5."], "6", "max")).toBe(true);
  expect(chatGptModelFamilyMatches(["6 Pro, 5 de 5."], "6", "max")).toBe(true);
  expect(chatGptModelFamilyMatches(["GPT-5.6 Sol Pro, 5 of 5."], "5.6", "max")).toBe(true);
  for (const descriptions of [[], ["Try Pro for more reasoning"], ["5.6 High, 3 of 5."], ["5.6 Pro, 5 of 5."],
    ["7 Pro, 5 of 5."], ["6 Sol Pro, 5 of 5."], ["6 Pro, 5 of 5.", "5.6 Pro, 5 of 5."], ["6 Pro for better answers"]]) {
    expect(chatGptModelFamilyMatches(descriptions, "6", "max")).toBe(false);
  }
  expect(chatGptModelFamilyMatches(["6 Pro, 5 of 5."], "5.6", "max")).toBe(false);
  expect(chatGptModelFamilyMatches(["6 Pro, 5 of 5."], "6", "xhigh")).toBe(false);
});

function switchingPicker(options: {
  modern?: boolean; advanced?: boolean; viewState?: string; toggles?: number;
  ignoreSelection?: boolean; duplicateOption?: boolean;
} = {}) {
  let selected = "6";
  let view = options.viewState ?? (options.advanced ? "advanced" : "simple");
  let toggleClicks = 0;
  let optionClicks = 0;
  const menu = { menu: {
    getByRole: (_role: string, query: { name: RegExp }) => {
      const family = query.name.test("GPT-5.6 Sol") ? "5.6" : "6";
      return {
        count: async () => options.duplicateOption ? 2 : 1,
        getAttribute: async () => String(selected === family),
        waitFor: async () => { expect(view).toBe("advanced"); },
        click: async () => {
          expect(view).toBe("advanced");
          optionClicks++;
          if (!options.ignoreSelection) selected = family;
          view = "simple";
        },
      };
    },
    locator: (selector: string) => {
      if (selector === "[data-model-picker-view]") return {
        count: async () => options.modern === false ? 0 : 1,
        getAttribute: async () => view,
      };
      const modernToggle = selector.includes("data-model-picker-view-toggle");
      expect(modernToggle).toBe(options.modern !== false);
      const toggle = {
        count: async () => options.toggles ?? 1,
        getAttribute: async () => String(view === "advanced"),
        click: async () => { toggleClicks++; view = view === "simple" ? "advanced" : "simple"; },
        filter: () => toggle,
      };
      return toggle;
    },
  } } as unknown as Parameters<typeof selectChatGptModelFamily>[0];
  return { menu, activate: async () => menu, state: () => ({ selected, toggleClicks, optionClicks }) };
}

test.each([true, false])("model family switches both directions and verifies the selected radio (modern=%s)", async modern => {
  const fixture = switchingPicker({ modern });
  await selectChatGptModelFamily(fixture.menu, "5.6", fixture.activate);
  expect(fixture.state()).toEqual({ selected: "5.6", toggleClicks: 1, optionClicks: 1 });
  await selectChatGptModelFamily(fixture.menu, "6", fixture.activate);
  expect(fixture.state()).toEqual({ selected: "6", toggleClicks: 2, optionClicks: 2 });
});

test("an already-open advanced picker must not be toggled closed", async () => {
  const fixture = switchingPicker({ advanced: true });
  await selectChatGptModelFamily(fixture.menu, "5.6", fixture.activate);
  expect(fixture.state()).toEqual({ selected: "5.6", toggleClicks: 0, optionClicks: 1 });
});

test("an already-selected family does not change the picker or the model", async () => {
  const fixture = switchingPicker();
  await selectChatGptModelFamily(fixture.menu, "6", fixture.activate);
  expect(fixture.state()).toEqual({ selected: "6", toggleClicks: 0, optionClicks: 0 });
});

test.each([
  { viewState: "unknown" }, { toggles: 0 }, { toggles: 2 }, { duplicateOption: true },
])("ambiguous or unsupported picker state cannot silently select another model: %j", async options => {
  const fixture = switchingPicker(options);
  await expect(selectChatGptModelFamily(fixture.menu, "5.6", fixture.activate))
    .rejects.toMatchObject({ code: "model_version_unavailable", retryable: false });
  expect(fixture.state().optionClicks).toBe(0);
});

test("a click without the requested checked family is a failure, not a successful switch", async () => {
  const fixture = switchingPicker({ ignoreSelection: true });
  await expect(selectChatGptModelFamily(fixture.menu, "5.6", fixture.activate))
    .rejects.toMatchObject({ code: "model_version_unavailable", retryable: false });
  expect(fixture.state().selected).toBe("6");
});

test("Simplified Chinese effort announcements preserve exact model and effort verification (#911)", () => {
  for (const [label, effort] of [["即时", "low"], ["中", "medium"], ["高", "high"]] as const) {
    expect(chatGptModelFamilyMatches([`GPT-6 Sol ${label}，第 3 项，共 3 项`, `6 ${label}`], "6", effort)).toBeTrue();
    expect(chatGptModelFamilyMatches([`5.6 ${label}`], "6", effort)).toBeFalse();
    expect(chatGptModelFamilyMatches([`6 Astra ${label}`], "6", effort)).toBeFalse();
    expect(chatGptModelFamilyMatches([`6 ${label}`, "6 Pro"], "6", effort)).toBeFalse();
  }
  for (const effort of ["low", "medium", "xhigh", "max"] as const) {
    expect(chatGptModelFamilyMatches(["6 高"], "6", effort)).toBeFalse();
  }
  for (const label of ["超高", "高级", "高 reasoning", "高 6.1"]) {
    expect(chatGptModelFamilyMatches([`6 ${label}`], "6", "high")).toBeFalse();
  }
});


test("model verification accepts Unicode announcement punctuation without weakening identity", () => {
  for (const separator of ["、", "，", "،", "؛", "：", "—", "。", ",", ";"]) {
    expect(chatGptModelFamilyMatches([`6 Pro${separator}5 件中 5 番目。`], "6", "max")).toBeTrue();
    expect(chatGptModelFamilyMatches([`GPT-5.6 Sol Pro${separator}translated position`], "5.6", "max")).toBeTrue();
    expect(chatGptModelFamilyMatches([`6.1 Pro${separator}position`], "6", "max")).toBeFalse();
    expect(chatGptModelFamilyMatches([`6 Sol Pro${separator}position`], "6", "max")).toBeFalse();
    expect(chatGptModelFamilyMatches([`6 Pro${separator}position`, "5.6 Pro"], "6", "max")).toBeFalse();
  }
  expect(chatGptModelFamilyMatches(["\u2068６ Pro\u2069、position"], "6", "max")).toBeTrue();
  expect(chatGptModelFamilyMatches(["6 Pro for better answers"], "6", "max")).toBeFalse();
});

test("repeated picker version verifies GPT-5.6 Pro without accepting conflicting evidence (#875)", () => {
  for (const header of ["5.6 Sol 5.6 Pro", "GPT-5.6 Sol GPT-5.6 Pro"]) {
    const evidence = ["5.6 Pro, 5 of 5.", header];
    expect(chatGptModelFamilyMatches(evidence, "5.6", "max")).toBeTrue();
    expect(chatGptUsageModelFromAnnouncements(evidence)).toBe("gpt-5.6-pro");
    expect(chatGptModelFamilyMatches(evidence, "5.6", "high")).toBeFalse();
    expect(chatGptModelFamilyMatches(evidence, "6", "max")).toBeFalse();
  }
  for (const header of ["5.6 Sol 6 Pro", "5.6 Sol 5.7 Pro", "5.6 Sol 5.6.1 Pro"]) {
    expect(chatGptModelFamilyMatches(["5.6 Pro, 5 of 5.", header], "5.6", "max")).toBeFalse();
    expect(chatGptModelFamilyMatches([header], "5.6", "high")).toBeFalse();
    expect(chatGptUsageModelFromAnnouncements([header])).toBe("pro-unknown");
  }
  expect(chatGptModelFamilyMatches(["6 Astra 6 Pro"], "6", "max")).toBeTrue();
  expect(chatGptModelFamilyMatches(["6 Astra 6 Pro"], "6", "high")).toBeFalse();
});
