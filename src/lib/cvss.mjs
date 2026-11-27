// CVSS 3.0 en 3.1: de basisscore uit een vector, volgens de specificatie van
// FIRST (https://www.first.org/cvss/v3.1/specification-document).

const GEWICHT = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
  PR: {
    U: { N: 0.85, L: 0.62, H: 0.27 },
    C: { N: 0.85, L: 0.68, H: 0.5 },
  },
};

function rondOp(x) {
  const i = Math.round(x * 100000);
  return i % 10000 === 0 ? i / 100000 : (Math.floor(i / 10000) + 1) / 10;
}

/** Geeft de basisscore (0 tot 10) of null als de vector geen CVSS 3.x is. */
export function cvss3Score(vector) {
  if (typeof vector !== "string" || !/^CVSS:3\.[01]\//.test(vector)) {
    return null;
  }
  const m = Object.fromEntries(
    vector
      .split("/")
      .slice(1)
      .map((deel) => deel.split(":")),
  );
  const av = GEWICHT.AV[m.AV];
  const ac = GEWICHT.AC[m.AC];
  const ui = GEWICHT.UI[m.UI];
  const pr = GEWICHT.PR[m.S]?.[m.PR];
  const c = GEWICHT.CIA[m.C];
  const i = GEWICHT.CIA[m.I];
  const a = GEWICHT.CIA[m.A];
  if ([av, ac, ui, pr, c, i, a].some((w) => w === undefined)) return null;

  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact =
    m.S === "U"
      ? 6.42 * iss
      : 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
  if (impact <= 0) return 0;
  const benutbaar = 8.22 * av * ac * pr * ui;
  return m.S === "U"
    ? rondOp(Math.min(impact + benutbaar, 10))
    : rondOp(Math.min(1.08 * (impact + benutbaar), 10));
}

/** Zet een score om naar de ernst die in de mail staat. */
export function ernstVanScore(score) {
  if (score === null || score === undefined) return "onbekend";
  if (score >= 9) return "kritiek";
  if (score >= 7) return "hoog";
  if (score >= 4) return "midden";
  if (score > 0) return "laag";
  return "onbekend";
}

const LABELS = {
  CRITICAL: "kritiek",
  HIGH: "hoog",
  MODERATE: "midden",
  MEDIUM: "midden",
  LOW: "laag",
};

/** Zet het label van een bron (GitHub, NVD) om naar de ernst in de mail. */
export function ernstVanLabel(label) {
  return LABELS[String(label ?? "").toUpperCase()] ?? "onbekend";
}

export const ERNST_VOLGORDE = ["kritiek", "hoog", "midden", "laag", "onbekend"];

/** De zwaarste ernst uit een lijst. */
export function zwaarste(ernsten) {
  return (
    ERNST_VOLGORDE.find((e) => e !== "onbekend" && ernsten.includes(e)) ??
    "onbekend"
  );
}
