import { describe, expect, it } from "vitest";
import { chooseStoreGroup } from "./select-store";

describe("chooseStoreGroup", () => {
  it("velger Rema ved uavgjort (terskel 0)", () => {
    const result = chooseStoreGroup(
      { remaTotal: 500, norgesgruppenTotal: 500 },
      { trumfPriceThreshold: 0 },
    );
    expect(result).toBe("REMA");
  });

  it("velger Rema når NorgesGruppen er dyrere", () => {
    const result = chooseStoreGroup(
      { remaTotal: 500, norgesgruppenTotal: 520 },
      { trumfPriceThreshold: 0 },
    );
    expect(result).toBe("REMA");
  });

  it("velger NorgesGruppen når besparelsen er >= terskel", () => {
    const result = chooseStoreGroup(
      { remaTotal: 500, norgesgruppenTotal: 480 },
      { trumfPriceThreshold: 10 },
    );
    expect(result).toBe("NORGESGRUPPEN");
  });

  it("velger Rema når besparelsen er under terskelen", () => {
    const result = chooseStoreGroup(
      { remaTotal: 500, norgesgruppenTotal: 495 },
      { trumfPriceThreshold: 10 },
    );
    expect(result).toBe("REMA");
  });

  it("besparelse nøyaktig lik terskelen gjør at NorgesGruppen vinner (>=)", () => {
    const result = chooseStoreGroup(
      { remaTotal: 501, norgesgruppenTotal: 500 },
      { trumfPriceThreshold: 1 },
    );
    expect(result).toBe("NORGESGRUPPEN");
  });

  it("er robust mot flyttallsavrunding i kronebeløp (500 - 499.99)", () => {
    const result = chooseStoreGroup(
      { remaTotal: 500, norgesgruppenTotal: 499.99 },
      { trumfPriceThreshold: 0.01 },
    );
    expect(result).toBe("NORGESGRUPPEN");
  });
});
