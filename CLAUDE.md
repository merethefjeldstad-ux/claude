# Maritime CleanTech Daily News Digest — email format

This repo is the working space for the scheduled task that compiles and sends the
"Maritime CleanTech Daily News Digest" email each morning (via WebSearch for
research and the Gmail MCP tool for sending — not the `medieovervaking/` Apps
Script project, which is a separate, still-in-testing pipeline).

## Layout (current spec)

Follow this section order in both `body` and `htmlBody`:

1. **Header** — "Daily media monitoring" / "Maritime CleanTech News Digest" /
   "Projects & industry developments — <date>", on the periwinkle gradient
   background per the Maritime CleanTech brand skill.
2. **News items**, grouped under short topic headings (e.g. "Alternative marine
   fuels — bunkering & supply infrastructure"). Each item: bold headline,
   2–3 sentence plain-language summary that includes the matched search word(s),
   a "Search words: ..." line, and a "Source: ... (date) — link" line.
3. **Coverage note** — placed *after* the news items, not before. One paragraph:
   what was searched/cross-checked against prior digests, then a single sentence
   — "No confirmed new items for other search words today." — instead of listing
   every search word from the brief. Add any relevant context (e.g. an event
   happening today) in this same note rather than as a separate section.
4. **Sign-off** — the closing line is just:
   "Automated daily digest for Maritime CleanTech and partner projects. Sources
   are monitored across Norwegian and international outlets; items already
   covered in a previous digest are not repeated."
   Do **not** include a tagline like "Together, we keep pace with what's
   decarbonizing shipping." — it is not part of Maritime CleanTech's branding.

## Other standing rules

- Cross-check against recent digests (search Gmail `in:sent` for prior
  "Maritime CleanTech Daily News Digest" threads) so items are never repeated.
- If nothing clears the bar for a given day, still send the email and say so
  plainly in the coverage note — don't skip sending.
- Recipients: merethe@, havard@, reber@, runar@, tiril@, kari@, fabian@,
  daniel@ — all @maritimecleantech.no.
- Styling follows the Maritime CleanTech brand skill (navy `#09152E` headings,
  `#313F54` body text, periwinkle/mint gradient accents) — read that skill's
  brand guide before restyling anything further.
