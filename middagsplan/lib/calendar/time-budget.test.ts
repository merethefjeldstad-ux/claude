import { describe, expect, it } from "vitest";
import {
  categoryForFreeMinutes,
  computeDayTimeBudget,
  freeMinutesForUser,
  DEFAULT_TIME_BUDGET_CONFIG,
} from "./time-budget";

const day = new Date("2026-09-09T00:00:00");

function at(hh: number, mm = 0) {
  const d = new Date(day);
  d.setHours(hh, mm, 0, 0);
  return d;
}

describe("freeMinutesForUser", () => {
  it("gir hele kveldsvinduet ledig uten avtaler", () => {
    expect(freeMinutesForUser([], day)).toBe(300); // 16:00-21:00 = 5t
  });

  it("trekker fra en avtale midt i vinduet", () => {
    const minutes = freeMinutesForUser(
      [{ start: at(17), end: at(18) }],
      day,
    );
    expect(minutes).toBe(240);
  });

  it("ignorerer avtaler helt utenfor vinduet", () => {
    const minutes = freeMinutesForUser(
      [{ start: at(9), end: at(10) }],
      day,
    );
    expect(minutes).toBe(300);
  });

  it("klipper en avtale som delvis overlapper vinduet", () => {
    const minutes = freeMinutesForUser(
      [{ start: at(15), end: at(17) }], // starter før vinduet, slutter kl 17
      day,
    );
    expect(minutes).toBe(240); // 1t opptatt inne i vinduet (16-17)
  });

  it("slår sammen overlappende avtaler", () => {
    const minutes = freeMinutesForUser(
      [
        { start: at(17), end: at(18, 30) },
        { start: at(18), end: at(19) },
      ],
      day,
    );
    expect(minutes).toBe(180); // opptatt 17:00-19:00 = 2t -> 300 - 120 = 180
  });
});

describe("categoryForFreeMinutes", () => {
  it("kjapt under terskel", () => {
    expect(categoryForFreeMinutes(20)).toBe("KJAPT");
  });
  it("middels mellom terskler", () => {
    expect(categoryForFreeMinutes(45)).toBe("MIDDELS");
  });
  it("tidkrevende over øvre terskel", () => {
    expect(categoryForFreeMinutes(90)).toBe("TIDKREVENDE");
  });
  it("respekterer justerte terskler", () => {
    expect(
      categoryForFreeMinutes(40, { ...DEFAULT_TIME_BUDGET_CONFIG, kjaptMaxMinutes: 50 }),
    ).toBe("KJAPT");
  });
});

describe("computeDayTimeBudget", () => {
  it("bruker den mest ledige av de to brukerne", () => {
    const user1Busy = [{ start: at(16), end: at(20, 30) }]; // 30 min ledig -> kjapt for bruker 1
    const user2Busy: { start: Date; end: Date }[] = []; // helt ledig -> tidkrevende for bruker 2
    const result = computeDayTimeBudget([user1Busy, user2Busy], day);
    expect(result.availableMinutes).toBe(300);
    expect(result.timeCategory).toBe("TIDKREVENDE");
  });
});
