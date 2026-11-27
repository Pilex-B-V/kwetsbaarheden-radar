import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { herstelVersie, soortLek, urgentie } from "../src/lib/beoordeel.mjs";
import { leesNcscFeed } from "../src/lib/bronnen/overig.mjs";
import { zoekOsv } from "../src/lib/bronnen/osv.mjs";
import { haal } from "../src/lib/http.mjs";
import { maakInstructie, opdracht } from "../src/lib/instructie.mjs";
import { controleerKaart, laadKaart } from "../src/lib/kaart.mjs";
import { esc, maakHtml, maakRapport, maakTekst, status } from "../src/lib/mail.mjs";
import { ncscVoorKaart, ochtendcheck } from "../src/lib/ochtendcheck.mjs";
import { bewaarStaat, laadStaat } from "../src/lib/staat.mjs";
import { verstuur, verzendwijze } from "../src/lib/verstuur.mjs";

/* ── Nagebootste bronnen ─────────────────────────────────────────────── */

const MELDING_NEXT = {
  id: "GHSA-f82v-jwr5-mffw",
  summary: "Authorization Bypass in Next.js Middleware",
  details: "It is possible to bypass authorization checks.",
  aliases: ["CVE-2025-29927"],
  published: "2025-03-21T15:20:12Z",
  modified: "2026-09-10T03:50:23Z",
  severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N" }],
  database_specific: { severity: "CRITICAL", cwe_ids: ["CWE-285", "CWE-863"] },
  references: [{ type: "ADVISORY", url: "https://nvd.nist.gov/vuln/detail/CVE-2025-29927" }],
  affected: [
    { package: { ecosystem: "npm", name: "next" }, ranges: [{ type: "SEMVER", events: [{ introduced: "13.0.0" }, { fixed: "13.5.9" }] }] },
    { package: { ecosystem: "npm", name: "next" }, ranges: [{ type: "SEMVER", events: [{ introduced: "14.0.0" }, { fixed: "14.2.25" }] }] },
    { package: { ecosystem: "npm", name: "next" }, ranges: [{ type: "SEMVER", events: [{ introduced: "15.0.0" }, { fixed: "15.2.3" }] }] },
  ],
};

const MELDING_XSS = {
  id: "GHSA-aaaa-bbbb-cccc",
  summary: 'Scherm <script>alert("x")</script> lekt',
  details: "",
  aliases: [],
  published: "2026-11-26T10:00:00Z",
  modified: "2026-11-26T10:00:00Z",
  database_specific: { severity: "MODERATE", cwe_ids: ["CWE-79"] },
  affected: [{ package: { ecosystem: "npm", name: "markdown-ding" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "2.1.1" }] }] }],
};

const KAART = {
  bedrijf: "Test B.V.",
  apps: [
    {
      naam: "Klantportaal",
      gevoeligheid: "hoog",
      bereikbaar: "internet",
      platform: [{ naam: "nodejs", versie: "22.11.0" }, { naam: "onbekendding", versie: "1.0" }],
      onderdelen: [
        { ecosysteem: "npm", naam: "next", versie: "15.2.2", direct: true, beheerder: "npm" },
        { ecosysteem: "npm", naam: "markdown-ding", versie: "2.1.0", direct: false, beheerder: "npm" },
      ],
    },
    { naam: "Urenapp", onderdelen: [{ ecosysteem: "npm", naam: "react", versie: "19.2.0", direct: true, beheerder: "npm" }] },
  ],
};

const NCSC_FEED = `<?xml version='1.0'?><rss><channel>
<item><title>NCSC-2026-0500 [1.00] [H/H] Kwetsbaarheden verholpen in Next.js</title><link>https://advisories.ncsc.nl/advisory?id=NCSC-2026-0500</link><pubDate>Thu, 26 Nov 2026 13:56:03 +0000</pubDate></item>
<item><title>NCSC-2026-0499 [1.01] [M/H] Kwetsbaarheid verholpen in React &amp; vrienden</title><link>https://advisories.ncsc.nl/advisory?id=NCSC-2026-0499</link><pubDate>Thu, 26 Nov 2026 09:00:00 +0000</pubDate></item>
<item><title>NCSC-2026-0400 [1.00] [M/M] Kwetsbaarheid verholpen in Drupal core</title><link>https://advisories.ncsc.nl/advisory?id=NCSC-2026-0400</link><pubDate>Mon, 02 Nov 2026 09:00:00 +0000</pubDate></item>
</channel></rss>`;

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

/** Een fetch die de bronnen naspeelt en bijhoudt wat er is gevraagd. */
function nepFetch(overschrijf = {}) {
  const verzoeken = [];
  const fn = async (url, opties = {}) => {
    const u = String(url);
    verzoeken.push({ url: u, ...opties });
    // Een test kan een bron vervangen: de sleutel is een hostnaam of een pad.
    const doel = new URL(u);
    for (const [sleutel, antwoord] of Object.entries(overschrijf)) {
      const raak = sleutel.startsWith("/") ? doel.pathname === sleutel : doel.hostname === sleutel;
      if (raak) return typeof antwoord === "function" ? antwoord(u, opties) : antwoord;
    }
    // De bron wordt herkend aan de precieze hostnaam, niet aan een stuk van het adres.
    const { hostname: host, pathname: pad } = new URL(u);
    if (host === "api.osv.dev" && pad === "/v1/querybatch") {
      const { queries } = JSON.parse(opties.body);
      return json({
        results: queries.map((q) =>
          q.package.name === "next"
            ? { vulns: [{ id: MELDING_NEXT.id, modified: MELDING_NEXT.modified }] }
            : q.package.name === "markdown-ding"
              ? { vulns: [{ id: MELDING_XSS.id, modified: MELDING_XSS.modified }] }
              : {},
        ),
      });
    }
    if (host === "api.osv.dev" && pad === `/v1/vulns/${MELDING_NEXT.id}`) return json(MELDING_NEXT);
    if (host === "api.osv.dev" && pad === `/v1/vulns/${MELDING_XSS.id}`) return json(MELDING_XSS);
    if (host === "services.nvd.nist.gov") return json({ totalResults: 294, vulnerabilities: [] });
    if (host === "www.cisa.gov") {
      return json({ vulnerabilities: [{ cveID: "CVE-2025-29927", dateAdded: "2026-11-26", knownRansomwareCampaignUse: "Unknown" }] });
    }
    if (host === "api.first.org") return json({ data: [{ cve: "CVE-2025-29927", epss: "0.752660000" }] });
    if (host === "euvdservices.enisa.europa.eu") {
      return json({ items: [{ id: "EUVD-2025-7243", aliases: "GHSA-f82v-jwr5-mffw\nCVE-2025-29927\n" }] });
    }
    if (host === "advisories.ncsc.nl" && pad === "/rss/advisories") return new Response(NCSC_FEED);
    if (host === "advisories.ncsc.nl" && pad.endsWith("/ncsc-2026-0500.json")) {
      return json({ vulnerabilities: [{ cve: "CVE-2025-29927" }], product_tree: { branches: [{ category: "vendor", name: "Vercel", branches: [{ category: "product_name", name: "Next.js" }] }] } });
    }
    if (host === "advisories.ncsc.nl" && pad.startsWith("/csaf/")) {
      return json({ vulnerabilities: [], product_tree: { branches: [{ category: "product_name", name: "React" }] } });
    }
    if (host === "nodejs.org" && pad === "/dist/index.json") {
      return json([
        { version: "v24.22.3", date: "2026-11-10", security: true },
        { version: "v22.23.5", date: "2026-11-11", security: true },
        { version: "v22.23.4", date: "2026-10-20", security: true },
        { version: "v22.12.0", date: "2024-12-03", security: false },
        { version: "v22.11.0", date: "2024-10-29", security: false },
      ]);
    }
    return new Response("niet gevonden", { status: 404 });
  };
  fn.verzoeken = verzoeken;
  return fn;
}

const legeStaat = () => ({ eersteRun: true, laatsteRun: null, gezien: {}, cache: { osv: {}, ncsc: {} } });
const NU = new Date("2026-11-27T06:40:00Z");

/* ── Beoordelen ──────────────────────────────────────────────────────── */

test("herstelversie: het bereik waar de versie in valt", () => {
  const o = (versie) => ({ ecosysteem: "npm", naam: "next", versie });
  assert.equal(herstelVersie(MELDING_NEXT, o("15.2.2")), "15.2.3");
  assert.equal(herstelVersie(MELDING_NEXT, o("14.1.0")), "14.2.25");
  assert.equal(herstelVersie(MELDING_NEXT, o("13.4.0")), "13.5.9");
  // Buiten elk bereik: de laagste herstelversie erboven, liefst zelfde hoofdversie.
  assert.equal(herstelVersie(MELDING_NEXT, o("12.9.0")), "13.5.9");
  assert.equal(herstelVersie(MELDING_NEXT, { ecosysteem: "npm", naam: "iets-anders", versie: "1.0.0" }), null);
  const py = { affected: [{ package: { ecosystem: "PyPI", name: "jinja2" }, ranges: [{ type: "ECOSYSTEM", events: [{ introduced: "0" }, { fixed: "3.1.5" }] }] }] };
  assert.equal(herstelVersie(py, { ecosysteem: "PyPI", naam: "Jinja2", versie: "3.1.4" }), "3.1.5");
  const zonder = { affected: [{ package: { ecosystem: "npm", name: "next" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { last_affected: "99.0.0" }] }] }] };
  assert.equal(herstelVersie(zonder, o("15.2.2")), null);
});

test("soort lek in gewone taal", () => {
  assert.equal(soortLek(["CWE-285", "CWE-863"]).kort, "lek in de toegangscontrole");
  assert.equal(soortLek(["CWE-79"]).kort, "code in de browser van gebruikers");
  // Het zwaarste gevolg wint.
  assert.equal(soortLek(["CWE-400", "CWE-502"]).kort, "eigen code uitvoeren");
  assert.equal(soortLek([]).kort, "beveiligingslek");
  assert.equal(soortLek(["NVD-CWE-noinfo"]).kort, "beveiligingslek");
});

test("urgentie volgt ernst, misbruik en de plek van de app", () => {
  const web = { gevoeligheid: "normaal", bereikbaar: "internet" };
  const intern = { gevoeligheid: "normaal", bereikbaar: "intern" };
  const gevoelig = { gevoeligheid: "hoog", bereikbaar: "internet" };
  assert.equal(urgentie({ ernst: "kritiek" }, web), 0);
  assert.equal(urgentie({ ernst: "hoog" }, web), 1);
  assert.equal(urgentie({ ernst: "hoog" }, gevoelig), 0);
  assert.equal(urgentie({ ernst: "kritiek" }, intern), 1);
  assert.equal(urgentie({ ernst: "midden" }, web), 2);
  assert.equal(urgentie({ ernst: "hoog", dev: true }, web), 2);
  assert.equal(urgentie({ ernst: "laag", misbruikt: true, dev: true }, intern), 0);
  assert.equal(urgentie({ ernst: "laag", dev: true }, intern), 3);
});

/* ── Bronnen ─────────────────────────────────────────────────────────── */

test("NCSC-feed lezen", () => {
  const lijst = leesNcscFeed(NCSC_FEED);
  assert.equal(lijst.length, 3);
  assert.deepEqual(
    { id: lijst[0].id, kans: lijst[0].kans, schade: lijst[0].schade, titel: lijst[0].titel },
    { id: "NCSC-2026-0500", kans: "H", schade: "H", titel: "Kwetsbaarheden verholpen in Next.js" },
  );
  assert.equal(lijst[1].titel, "Kwetsbaarheid verholpen in React & vrienden");
});

test("NCSC-advies koppelen aan de kaart, zonder loze treffers", () => {
  const kaart = controleerKaart(KAART);
  const adviezen = leesNcscFeed(NCSC_FEED).map((a) => ({ ...a, producten: [] }));
  const sinds = new Date("2026-11-26T06:00:00Z");
  const uit = ncscVoorKaart(adviezen, kaart, sinds);
  assert.deepEqual(uit.map((a) => a.id), ["NCSC-2026-0500", "NCSC-2026-0499"]);
  assert.deepEqual(uit[0].raakt, ["next (Klantportaal)"]);
  // Al gekoppeld aan een bevinding: niet nog een keer noemen.
  assert.deepEqual(ncscVoorKaart(adviezen, kaart, sinds, new Set(["NCSC-2026-0500"])).map((a) => a.id), ["NCSC-2026-0499"]);
});

test("OSV: vervolgpagina's en cache", async () => {
  let ronde = 0;
  const fetchFn = nepFetch({
    "/v1/querybatch": (_u, opties) => {
      ronde++;
      const { queries } = JSON.parse(opties.body);
      if (ronde === 1) {
        assert.equal(queries.length, 2);
        return json({ results: [{ vulns: [{ id: MELDING_NEXT.id, modified: "a" }], next_page_token: "verder" }, {}] });
      }
      assert.equal(queries.length, 1);
      assert.equal(queries[0].page_token, "verder");
      return json({ results: [{ vulns: [{ id: MELDING_XSS.id, modified: "b" }] }] });
    },
  });
  const cache = { "GHSA-oud": { id: "GHSA-oud" } };
  const onderdelen = [
    { ecosysteem: "npm", naam: "next", versie: "15.2.2" },
    { ecosysteem: "npm", naam: "react", versie: "19.0.0" },
  ];
  const uit = await zoekOsv(onderdelen, { fetchFn, cache });
  assert.deepEqual(uit.perOnderdeel.get("npm|next|15.2.2"), [MELDING_NEXT.id, MELDING_XSS.id]);
  assert.equal(uit.meldingen.size, 2);
  assert.deepEqual(Object.keys(cache).sort(), [MELDING_XSS.id, MELDING_NEXT.id].sort());
  // Tweede keer met dezelfde "modified": geen details meer ophalen.
  ronde = 0;
  const voor = fetchFn.verzoeken.length;
  cache[MELDING_NEXT.id].modified = "a";
  cache[MELDING_XSS.id].modified = "b";
  await zoekOsv(onderdelen, { fetchFn, cache });
  assert.equal(fetchFn.verzoeken.slice(voor).filter((v) => v.url.includes("/v1/vulns/")).length, 0);
});

test("haal probeert opnieuw bij een storing en stopt bij een 404", async () => {
  let n = 0;
  const storing = async () => (++n < 3 ? new Response("", { status: 503 }) : new Response("ok"));
  assert.equal(await (await haal("https://voorbeeld.test/a", { fetchFn: storing, pauze: 1 })).text(), "ok");
  assert.equal(n, 3);
  n = 0;
  const weg = async () => (n++, new Response("", { status: 404 }));
  await assert.rejects(haal("https://voorbeeld.test/a", { fetchFn: weg, pauze: 1 }), /voorbeeld\.test: status 404/);
  assert.equal(n, 1);
});

/* ── De hele check ───────────────────────────────────────────────────── */

test("ochtendcheck: van kaart tot mail", async () => {
  const fetchFn = nepFetch();
  const staat = legeStaat();
  const r = await ochtendcheck(controleerKaart(KAART), staat, { fetchFn, nu: NU, omgeving: {}, nvdPauze: 1 });

  assert.equal(r.mislukt, false);
  assert.deepEqual(r.bronnen.map((b) => [b.naam, b.gelukt]), [
    ["OSV.dev (GitHub Advisories)", true],
    ["NVD", true],
    ["CISA KEV", true],
    ["NCSC", true],
    ["nodejs.org", true],
    ["EPSS", true],
    ["EUVD", true],
  ]);
  assert.equal(r.cijfers.nieuwGepubliceerd, 294);
  assert.equal(r.cijfers.apps, 2);
  assert.deepEqual(r.rustig, ["Urenapp"]);

  const [next, node, xss] = r.bevindingen;
  assert.equal(next.onderdeel.naam, "next");
  assert.equal(next.ernst, "kritiek");
  assert.equal(next.fix, "15.2.3");
  assert.equal(next.stap, "patch");
  assert.equal(next.advies, "Vandaag");
  assert.equal(next.misbruikt, true);
  assert.equal(next.meldingen[0].score, 9.1);
  assert.equal(next.meldingen[0].epss, 0.75266);
  assert.equal(next.meldingen[0].euvd, "EUVD-2025-7243");
  assert.equal(next.meldingen[0].ncsc.id, "NCSC-2026-0500");
  assert.equal(next.meldingen[0].soort.kort, "lek in de toegangscontrole");
  assert.equal(next.nieuw, true);

  assert.equal(node.soort, "platform");
  assert.equal(node.fix, "22.23.5");
  assert.match(node.meldingen[0].titel, /^2 beveiligingsreleases gemist/);

  assert.equal(xss.ernst, "midden");
  assert.equal(xss.niveau, 2);
  assert.equal(xss.fix, "2.1.1");

  assert.ok(r.waarschuwingen.some((w) => /onbekendding 1\.0 .* controleert het niet/.test(w)));
  // Het NCSC-advies over Next.js hangt al aan de bevinding; React is nieuws.
  assert.deepEqual(r.ncscNieuws.map((a) => a.id), ["NCSC-2026-0499"]);

  const s = status(r);
  assert.equal(s.onderwerp, "Ochtendcheck vr 27 nov · nulmeting: 2 lekken raken je apps, 1 app niet volledig gecontroleerd");
  assert.deepEqual(r.onvolledig, ["Klantportaal"]);

  const html = maakHtml({ ...r, instructiesMail: r.instructiesMail });
  assert.ok(html.includes("Wordt actief misbruikt (CISA KEV, sinds 2026-11-26)."));
  assert.ok(html.includes("Update naar 15.2.3 · ongeveer 10 minuten werk, plus testen"));
  assert.ok(html.includes("Geen actie nodig:</b> Urenapp"));
  assert.ok(html.includes("npm install next@15.2.3"));
  // Tekst uit een bron komt nooit als HTML in de mail.
  const uitgelicht = maakHtml({ ...r, bevindingen: r.bevindingen.map((b) => ({ ...b, niveau: 0 })) });
  assert.ok(!uitgelicht.includes("<script>"));
  assert.ok(uitgelicht.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));

  const tekst = maakTekst(r);
  assert.ok(tekst.includes("KRITIEK · Klantportaal · advies: vandaag · nieuw"));
  assert.ok(maakRapport(r).includes("| next | 15.2.2 | kritiek, actief misbruikt | Vandaag | 15.2.3 |"));

  // De radar stuurt alleen naam en versie naar OSV, niets anders van de kaart.
  const osvVerzoek = fetchFn.verzoeken.find((v) => v.url.endsWith("/querybatch"));
  assert.deepEqual(JSON.parse(osvVerzoek.body).queries[0], { package: { ecosystem: "npm", name: "next" }, version: "15.2.2" });
  assert.ok(!fetchFn.verzoeken.some((v) => (v.body ?? "").includes("Klantportaal") || v.url.includes("Klantportaal")));
});

test("tweede run: alleen wat erbij kwam is nieuw", async () => {
  const staat = legeStaat();
  const kaart = controleerKaart(KAART);
  await ochtendcheck(kaart, staat, { fetchFn: nepFetch(), nu: new Date("2026-11-26T06:40:00Z"), omgeving: {} });
  staat.eersteRun = false;
  staat.laatsteRun = new Date("2026-11-26T06:40:00Z");
  const r = await ochtendcheck(kaart, staat, { fetchFn: nepFetch(), nu: NU, omgeving: {} });
  assert.ok(r.bevindingen.every((b) => b.nieuw === false));
  assert.equal(r.bevindingen[0].sinds, "26 nov");
  assert.equal(status(r).onderwerp, "Ochtendcheck vr 27 nov · niets nieuws, 2 updates staan nog open, 1 app niet volledig gecontroleerd");
  assert.ok(maakHtml(r).includes("open sinds 26 nov"));
});

test("alles rustig", async () => {
  const kaart = controleerKaart({ apps: [KAART.apps[1]] });
  const r = await ochtendcheck(kaart, legeStaat(), { fetchFn: nepFetch(), nu: NU, omgeving: {} });
  assert.equal(r.bevindingen.length, 0);
  assert.equal(status(r).onderwerp, "Ochtendcheck vr 27 nov · niks aan de hand");
  const html = maakHtml(r);
  assert.ok(html.includes("Geen actie nodig:</b> Urenapp"));
  assert.ok(!html.includes("Nu oppakken"));
});

test("een bron die uitvalt staat in de mail, de rest gaat door", async () => {
  const fetchFn = nepFetch({ "www.cisa.gov": new Response("", { status: 404 }) });
  const r = await ochtendcheck(controleerKaart(KAART), legeStaat(), { fetchFn, nu: NU, omgeving: {} });
  assert.equal(r.mislukt, false);
  assert.equal(r.bevindingen[0].misbruikt, false);
  assert.match(maakHtml(r), /Geen antwoord van: CISA KEV \(www\.cisa\.gov: status 404\)/);
});

test("valt OSV uit, dan zegt de mail dat de controle niet is gelukt", async () => {
  const fetchFn = nepFetch({ "/v1/querybatch": new Response("", { status: 400 }) });
  const staat = legeStaat();
  staat.gezien = { bestaand: "2026-11-01T00:00:00.000Z" };
  const r = await ochtendcheck(controleerKaart(KAART), staat, { fetchFn, nu: NU, omgeving: {} });
  assert.equal(r.mislukt, true);
  assert.equal(status(r).onderwerp, "Ochtendcheck vr 27 nov · controle niet gelukt");
  assert.ok(maakHtml(r).includes("De controle is vandaag niet gelukt"));
  assert.deepEqual(r.rustig, []);
  // Wat de radar al wist, blijft staan.
  assert.deepEqual(staat.gezien, { bestaand: "2026-11-01T00:00:00.000Z" });
});

/* ── Instructie, kaart, staat en verzenden ───────────────────────────── */

test("opdracht per pakketbeheerder", () => {
  assert.equal(opdracht({ naam: "next", beheerder: "npm", direct: true }, "15.2.3"), "npm install next@15.2.3");
  assert.match(opdracht({ naam: "postcss", beheerder: "npm", direct: false }, "8.5.0"), /^npm update postcss .*overrides/);
  assert.equal(opdracht({ naam: "vite", beheerder: "pnpm", direct: true, dev: true }, "6.2.1"), "pnpm add -D vite@6.2.1");
  assert.match(opdracht({ naam: "jinja2", beheerder: "pip" }, "3.1.6"), /^pip install "jinja2==3\.1\.6"/);
  assert.equal(maakInstructie({ naam: "Leeg" }, [], "27 november 2026"), null);
});

test("de kaart wordt gecontroleerd", () => {
  assert.throws(() => controleerKaart({ apps: [] }), /geen app/);
  assert.throws(() => controleerKaart({ apps: [{ naam: "A" }, { naam: "A" }] }), /twee keer/);
  assert.throws(() => controleerKaart({ apps: [{ naam: "A", gevoeligheid: "enorm" }] }), /gevoeligheid/);
  assert.throws(() => controleerKaart({ apps: [{ naam: "A", bronnen: [{ soort: "github", pad: "x", repo: "geen-slash" }] }] }), /eigenaar\/naam/);
  const ok = controleerKaart({ apps: [{ naam: " A " }] });
  assert.deepEqual([ok.apps[0].naam, ok.apps[0].gevoeligheid, ok.apps[0].bereikbaar], ["A", "normaal", "internet"]);
});

test("kaart laden: lockfile van schijf en uit GitHub", async () => {
  const map = mkdtempSync(join(tmpdir(), "radar-"));
  writeFileSync(join(map, "package-lock.json"), readFileSync(new URL("./fixtures/package-lock.json", import.meta.url)));
  writeFileSync(
    join(map, "kaart.json"),
    JSON.stringify({
      apps: [
        { naam: "Lokaal", bronnen: [{ soort: "bestand", pad: "package-lock.json" }] },
        { naam: "Ver", bronnen: [{ soort: "github", repo: "bedrijf/app", pad: "api/requirements.txt", ref: "main" }] },
        { naam: "Stuk", bronnen: [{ soort: "bestand", pad: "bestaat-niet/yarn.lock" }] },
      ],
    }),
  );
  const fetchFn = nepFetch({ "api.github.com": new Response("flask==3.0.0\n") });
  const kaart = await laadKaart(join(map, "kaart.json"), { omgeving: { RADAR_GITHUB_TOKEN: "geheim" }, fetchFn });
  assert.equal(kaart.apps[0].onderdelen.length, 7);
  assert.deepEqual(kaart.apps[1].onderdelen.map((o) => `${o.naam}@${o.versie}`), ["flask@3.0.0"]);
  const verzoek = fetchFn.verzoeken[0];
  assert.equal(verzoek.url, "https://api.github.com/repos/bedrijf/app/contents/api/requirements.txt?ref=main");
  assert.equal(verzoek.headers.authorization, "Bearer geheim");
  assert.equal(kaart.apps[2].waarschuwingen.length, 1);
  // Een openbare repository is zonder token te lezen.
  const openbaar = nepFetch({ "api.github.com": new Response("flask==3.0.0\n") });
  const zonder = await laadKaart(join(map, "kaart.json"), { omgeving: {}, fetchFn: openbaar });
  assert.equal(zonder.apps[1].onderdelen.length, 1);
  assert.equal(openbaar.verzoeken[0].headers.authorization, undefined);
  // Een afgeschermde repository zonder token: een melding die zegt wat je doet.
  const dicht = nepFetch({ "api.github.com": new Response("", { status: 404 }) });
  const geen = await laadKaart(join(map, "kaart.json"), { omgeving: {}, fetchFn: dicht });
  assert.match(geen.apps[1].waarschuwingen[0], /bedrijf\/app\/api\/requirements\.txt is niet gelezen: niet gevonden.*RADAR_GITHUB_TOKEN/);
  // Met een token dat er niet bij mag of is verlopen.
  const verlopen = await laadKaart(join(map, "kaart.json"), { omgeving: { RADAR_GITHUB_TOKEN: "oud" }, fetchFn: dicht });
  assert.match(verlopen.apps[1].waarschuwingen[0], /geen toegang.*niet is verlopen/);
});

test("staat bewaren en teruglezen", async () => {
  const map = mkdtempSync(join(tmpdir(), "radar-staat-"));
  const leeg = await laadStaat(map);
  assert.equal(leeg.eersteRun, true);
  await bewaarStaat(map, { nu: NU, gezien: { a: "2026-11-27T06:40:00.000Z" }, cache: { osv: { x: 1 }, ncsc: {} } });
  const terug = await laadStaat(map);
  assert.equal(terug.eersteRun, false);
  assert.equal(terug.laatsteRun.toISOString(), NU.toISOString());
  assert.deepEqual(terug.gezien, { a: "2026-11-27T06:40:00.000Z" });
  assert.deepEqual(terug.cache.osv, { x: 1 });
});

test("verzenden via Outlook (Microsoft Graph)", async () => {
  const omgeving = {
    RADAR_TENANT_ID: "tenant",
    RADAR_CLIENT_ID: "client",
    RADAR_CLIENT_SECRET: "geheim",
    RADAR_MAIL_VAN: "radar@voorbeeld.nl",
    RADAR_MAIL_AAN: "jij@voorbeeld.nl; it@voorbeeld.nl",
  };
  assert.equal(verzendwijze(omgeving), "graph");
  const fetchFn = nepFetch({
    "login.microsoftonline.com": json({ access_token: "token-123" }),
    "graph.microsoft.com": new Response(null, { status: 202 }),
  });
  const uit = await verstuur({ onderwerp: "Ochtendcheck", html: "<p>hoi</p>" }, { omgeving, fetchFn });
  assert.equal(uit, "verstuurd naar 2 adressen via Outlook");
  const [token, zend] = fetchFn.verzoeken;
  assert.equal(token.url, "https://login.microsoftonline.com/tenant/oauth2/v2.0/token");
  assert.match(token.body, /grant_type=client_credentials/);
  assert.match(token.body, /scope=https%3A%2F%2Fgraph\.microsoft\.com%2F\.default/);
  assert.equal(zend.url, "https://graph.microsoft.com/v1.0/users/radar%40voorbeeld.nl/sendMail");
  assert.equal(zend.headers.authorization, "Bearer token-123");
  const body = JSON.parse(zend.body);
  assert.deepEqual(body.message.toRecipients, [
    { emailAddress: { address: "jij@voorbeeld.nl" } },
    { emailAddress: { address: "it@voorbeeld.nl" } },
  ]);
  assert.deepEqual(body.message.body, { contentType: "HTML", content: "<p>hoi</p>" });
  assert.equal(body.saveToSentItems, false);
});

test("verzendwijze: webhook, niets, of een halve instelling", async () => {
  assert.equal(verzendwijze({}), null);
  assert.equal(verzendwijze({ RADAR_WEBHOOK_URL: "https://hook.test/x" }), "webhook");
  assert.throws(() => verzendwijze({ RADAR_TENANT_ID: "t", RADAR_CLIENT_ID: "c" }), /RADAR_CLIENT_SECRET, RADAR_MAIL_VAN, RADAR_MAIL_AAN/);
  const fetchFn = nepFetch({ "hook.test": new Response("ok") });
  const uit = await verstuur(
    { onderwerp: "O", status: "niks aan de hand", html: "<p/>", tekst: "t", cijfers: { apps: 1 } },
    { omgeving: { RADAR_WEBHOOK_URL: "https://hook.test/x" }, fetchFn },
  );
  assert.equal(uit, "verstuurd naar de webhook");
  assert.deepEqual(Object.keys(JSON.parse(fetchFn.verzoeken[0].body)), ["onderwerp", "status", "html", "tekst", "cijfers"]);
  assert.equal(await verstuur({}, { omgeving: {}, fetchFn }), null);
});

test("esc maakt tekens onschadelijk", () => {
  assert.equal(esc(`<a href="x" onclick='y'>&</a>`), "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  assert.equal(esc(null), "");
});

test("een app die niet is gelezen, staat nooit onder geen actie nodig", async () => {
  const kaart = controleerKaart({ apps: [KAART.apps[1], { naam: "Offertetool", bronnen: [{ soort: "bestand", pad: "weg/package-lock.json" }] }] });
  // Zo zet laadKaart het neer als een lockfile niet te lezen is.
  kaart.apps[1].waarschuwingen = ["weg/package-lock.json is niet gelezen: bestaat niet"];
  const r = await ochtendcheck(kaart, legeStaat(), { fetchFn: nepFetch(), nu: NU, omgeving: {} });
  assert.deepEqual(r.rustig, ["Urenapp"]);
  assert.deepEqual(r.onvolledig, ["Offertetool"]);
  assert.equal(status(r).onderwerp, "Ochtendcheck vr 27 nov · 1 app niet volledig gecontroleerd");
  const html = maakHtml(r);
  assert.ok(html.includes("Niet volledig gecontroleerd:</b> Offertetool"));
  assert.ok(html.includes("Geen actie nodig:</b> Urenapp"));
  assert.ok(maakTekst(r).includes("Niet volledig gecontroleerd: Offertetool"));
});

test("een platformonderdeel dat niet te controleren is, telt als onvolledig", async () => {
  const kaart = controleerKaart({
    apps: [
      { naam: "Portaal", platform: [{ naam: "postgresql", versie: "16.4" }] },
      { naam: "Site", platform: [{ naam: "vreemd", versie: "1.0" }] },
      { naam: "Urenapp", platform: [{ naam: "nodejs", versie: "22.23.5" }] },
    ],
  });
  const fetchFn = nepFetch({ "services.nvd.nist.gov": (u) => (u.includes("virtualMatchString") ? new Response("", { status: 400 }) : json({ totalResults: 294, vulnerabilities: [] })) });
  const r = await ochtendcheck(kaart, legeStaat(), { fetchFn, nu: NU, omgeving: {}, nvdPauze: 1 });
  assert.deepEqual(r.onvolledig, ["Portaal", "Site"]);
  assert.deepEqual(r.rustig, ["Urenapp"]);
  assert.ok(r.waarschuwingen.some((w) => /Portaal: postgresql 16\.4 is vandaag niet gecontroleerd/.test(w)));
  assert.equal(r.bronnen.find((b) => b.naam === "NVD").gelukt, false);
});

test("tussenstap: wat de hoogste versie binnen je hoofdversie oplost", async () => {
  const { zoekTussenstap } = await import("../src/lib/beoordeel.mjs");
  const meldingen = [{ fix: "5.4.21" }, { fix: "5.0.12" }, { fix: "6.4.4" }, { fix: null }];
  assert.deepEqual(zoekTussenstap("5.0.0", meldingen), { versie: "5.4.21", lostOp: 2, totaal: 4 });
  assert.equal(zoekTussenstap("5.0.0", [{ fix: "6.4.4" }]), null);
  // Onder versie 1 is een stap in het tweede getal al een hoofdversie.
  assert.equal(zoekTussenstap("0.33.5", [{ fix: "0.35.5" }]), null);
  assert.deepEqual(zoekTussenstap("0.33.5", [{ fix: "0.33.9" }, { fix: "0.35.5" }]), { versie: "0.33.9", lostOp: 1, totaal: 2 });
});

test("ontbreekt de kaart, dan zegt de melding wat je doet", async () => {
  await assert.rejects(laadKaart(join(tmpdir(), "bestaat-niet", "techniekkaart.json")), /Er is nog geen .*npm run voorbeeld/);
  const map = mkdtempSync(join(tmpdir(), "radar-stuk-"));
  writeFileSync(join(map, "kaart.json"), "{ dit is geen json");
  await assert.rejects(laadKaart(join(map, "kaart.json")), /is geen geldige JSON/);
});

test("instellingen uit .env: wat al is gezet gaat voor, lege regels tellen niet", async () => {
  const { laadEnv, leesEnvTekst } = await import("../src/lib/omgeving.mjs");
  assert.deepEqual(
    leesEnvTekst('# uitleg\nA=1\nexport B = "twee woorden"\nC=\'x=y\'\nD=waarde # toelichting\nE=\n\nrommel'),
    { A: "1", B: "twee woorden", C: "x=y", D: "waarde", E: "" },
  );
  const map = mkdtempSync(join(tmpdir(), "radar-env-"));
  writeFileSync(join(map, ".env"), "RADAR_MAIL_VAN=radar@voorbeeld.nl\nRADAR_MAIL_AAN=\nRADAR_TENANT_ID=uit-bestand\n");
  const omgeving = { RADAR_TENANT_ID: "al-gezet" };
  assert.deepEqual(laadEnv(join(map, ".env"), omgeving), ["RADAR_MAIL_VAN"]);
  assert.deepEqual(omgeving, { RADAR_TENANT_ID: "al-gezet", RADAR_MAIL_VAN: "radar@voorbeeld.nl" });
  assert.deepEqual(laadEnv(join(map, "bestaat-niet"), omgeving), []);
});
