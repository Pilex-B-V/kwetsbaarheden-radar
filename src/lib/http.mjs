// Eén plek voor alle uitgaande verzoeken: een tijdslimiet, een paar nieuwe
// pogingen bij een storing, en een eigen naam in de User-Agent zodat de
// bronnen zien wie er aanklopt.

const AGENT =
  "kwetsbaarheden-radar/1.0 (+https://github.com/Pilex-B-V/kwetsbaarheden-radar)";

export const wacht = (ms) => new Promise((klaar) => setTimeout(klaar, ms));

/**
 * Doet een verzoek en geeft de Response terug. Bij drukte (429), een storing
 * aan de andere kant (5xx) of een netwerkfout volgt een nieuwe poging. Lukt
 * het niet, dan komt er een fout met een leesbare melding.
 */
export async function haal(url, opties = {}) {
  const {
    method = "GET",
    headers = {},
    body,
    tijdslimiet = 30_000,
    pogingen = 3,
    pauze = 1500,
    fetchFn = fetch,
  } = opties;
  const host = new URL(url).host;
  let reden = "onbekende fout";
  for (let poging = 1; poging <= pogingen; poging++) {
    let antwoord;
    try {
      antwoord = await fetchFn(url, {
        method,
        headers: { "user-agent": AGENT, ...headers },
        body,
        signal: AbortSignal.timeout(tijdslimiet),
      });
    } catch (fout) {
      reden = fout.name === "TimeoutError" ? "geen antwoord binnen de tijd" : fout.message;
      if (poging < pogingen) await wacht(pauze * poging);
      continue;
    }
    if (antwoord.ok) return antwoord;
    reden = `status ${antwoord.status}`;
    if (antwoord.status !== 429 && antwoord.status < 500) break;
    if (poging < pogingen) await wacht(pauze * poging);
  }
  throw new Error(`${host}: ${reden}`);
}

export async function haalJson(url, opties) {
  return (await haal(url, opties)).json();
}

export async function haalTekst(url, opties) {
  return (await haal(url, opties)).text();
}

/** Voert taken uit met een maximum aantal tegelijk. */
export async function gelijktijdig(items, maximum, taak) {
  const uit = new Array(items.length);
  let volgende = 0;
  const werker = async () => {
    while (volgende < items.length) {
      const i = volgende++;
      uit[i] = await taak(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(maximum, items.length) }, werker),
  );
  return uit;
}
