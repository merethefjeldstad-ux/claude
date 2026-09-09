/**
 * Enkel strukturert logger. I fase 1 logges feil til stdout/stderr (fanges
 * opp av hosting-plattformens loggsystem) — ingen push/e-post skal sendes
 * (se krav). OfferFetchLog i databasen er "varselet" et menneske kan sjekke.
 */

type LogFields = Record<string, unknown>;

function format(level: string, message: string, fields?: LogFields): string {
  const base = { level, message, time: new Date().toISOString(), ...fields };
  return JSON.stringify(base);
}

export const logger = {
  info(message: string, fields?: LogFields) {
    console.log(format("info", message, fields));
  },
  warn(message: string, fields?: LogFields) {
    console.warn(format("warn", message, fields));
  },
  error(message: string, fields?: LogFields) {
    console.error(format("error", message, fields));
  },
};
