import { expect, test } from "bun:test";
import { ChatGptPairedRangeAudit, type ChatGptMarkdownSegment } from "../src/adapters/chatgpt-web/markdown";

function ranged(sourceStart: number, text: string, tag = "p"): ChatGptMarkdownSegment {
  return {
    key: `${sourceStart}:${tag}`,
    tag,
    html: `<${tag}>${text}</${tag}>`,
    text,
    sourceStart,
    sourceEnd: sourceStart + text.length,
    streamable: true,
  };
}

function unranged(index: number, text: string): ChatGptMarkdownSegment {
  return { key: `${index}:p`, tag: "p", html: `<p>${text}</p>`, text, streamable: false };
}

test("predicts a ranged commit only after a following block and the stability window", () => {
  const audit = new ChatGptPairedRangeAudit();
  const first = [ranged(0, "Primeiro parágrafo."), ranged(20, "Segundo parágrafo.")];

  audit.observe(first, 0);
  expect(audit.summary().commitsPredicted).toBe(0);
  audit.observe(first, 500);
  expect(audit.summary().commitsPredicted).toBe(0);
  audit.observe(first, 800);
  expect(audit.summary()).toMatchObject({
    rangedBlockObservations: 6,
    commitsPredicted: 1,
    rewritesAfterPredictedCommit: 0,
    orderViolations: 0,
  });
});

test("reports a rewrite of a predicted-committed range as would-fail evidence", () => {
  const audit = new ChatGptPairedRangeAudit();
  const stable = [ranged(0, "Original."), ranged(10, "Final.")];
  audit.observe(stable, 0);
  audit.observe(stable, 800);
  expect(audit.summary().commitsPredicted).toBe(1);

  audit.observe([ranged(0, "Reescrito depois das ferramentas."), ranged(40, "Final.")], 1_000);
  expect(audit.summary().rewritesAfterPredictedCommit).toBe(1);
});

test("does not predict a commit for the active tail block", () => {
  const audit = new ChatGptPairedRangeAudit();
  audit.observe([ranged(0, "Só um bloco ainda crescendo")], 0);
  audit.observe([ranged(0, "Só um bloco ainda crescendo")], 5_000);
  expect(audit.summary().commitsPredicted).toBe(0);
});

test("flags non-monotonic source ranges and ignores unranged paired blocks", () => {
  const audit = new ChatGptPairedRangeAudit();
  audit.observe([unranged(0, "posicional"), unranged(1, "posicional dois")], 0);
  expect(audit.summary().rangedBlockObservations).toBe(0);

  audit.observe([ranged(50, "depois"), ranged(10, "antes")], 1_000);
  expect(audit.summary().orderViolations).toBe(1);
});
