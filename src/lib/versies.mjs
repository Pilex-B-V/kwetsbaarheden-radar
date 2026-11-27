// Versies vergelijken. Goed genoeg voor npm (semver), PyPI en Packagist om te
// bepalen of een versie binnen een getroffen bereik valt en hoe groot de
// sprong naar de herstelversie is.

/** Splitst "v15.2.3-canary.4+build" in getallen en een voorversie-deel. */
export function ontleed(versie) {
  const schoon = String(versie ?? "")
    .trim()
    .replace(/^[vV=]+/, "")
    .split("+")[0];
  const m = schoon.match(/^(\d+(?:\.\d+)*)(.*)$/);
  if (!m) return { getallen: [], rest: schoon };
  return {
    getallen: m[1].split(".").map(Number),
    rest: m[2].replace(/^[-._]/, "").toLowerCase(),
  };
}

function vergelijkRest(a, b) {
  if (a === b) return 0;
  // "post" (PyPI) komt na de gewone release; elke andere toevoeging ervoor.
  const na = (r) => r.startsWith("post");
  const rang = (r) => (r === "" ? 1 : na(r) ? 2 : 0);
  if (rang(a) !== rang(b)) return rang(a) < rang(b) ? -1 : 1;
  const xs = a.split(/[.\-_]/);
  const ys = b.split(/[.\-_]/);
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    if (xs[i] === undefined) return -1;
    if (ys[i] === undefined) return 1;
    const xn = /^\d+$/.test(xs[i]);
    const yn = /^\d+$/.test(ys[i]);
    if (xn && yn) {
      const d = Number(xs[i]) - Number(ys[i]);
      if (d) return d < 0 ? -1 : 1;
    } else if (xn !== yn) {
      return xn ? -1 : 1;
    } else if (xs[i] !== ys[i]) {
      return xs[i] < ys[i] ? -1 : 1;
    }
  }
  return 0;
}

/** -1 als a lager is dan b, 1 als hoger, 0 als gelijk. */
export function vergelijk(a, b) {
  const x = ontleed(a);
  const y = ontleed(b);
  const n = Math.max(x.getallen.length, y.getallen.length);
  for (let i = 0; i < n; i++) {
    const d = (x.getallen[i] ?? 0) - (y.getallen[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return vergelijkRest(x.rest, y.rest);
}

/** Hoe groot is de stap van `van` naar `naar`: patch, minor, major of onbekend. */
export function sprong(van, naar) {
  const x = ontleed(van).getallen;
  const y = ontleed(naar).getallen;
  if (!x.length || !y.length) return "onbekend";
  if ((x[0] ?? 0) !== (y[0] ?? 0)) return "major";
  // Onder 1.0 kan een minor-stap al brekend zijn; behandel hem als major.
  if ((x[1] ?? 0) !== (y[1] ?? 0)) return (x[0] ?? 0) === 0 ? "major" : "minor";
  return "patch";
}

/** De hoogste versie uit een lijst. */
export function hoogste(versies) {
  return versies.reduce((a, b) => (a && vergelijk(a, b) >= 0 ? a : b), null);
}
