// De ochtendmail, als HTML voor Outlook en als platte tekst. De opmaak
// gebruikt tabellen en inline stijlen, omdat Outlook op Windows niets anders
// betrouwbaar toont. Alles wat uit een bron komt, gaat eerst door esc().

const KLEUR = {
  kritiek: { tekst: "#B3261E", vlak: "#FCEEEE", rand: "#D93025" },
  hoog: { tekst: "#A04A00", vlak: "#FFF3E6", rand: "#E8710A" },
  midden: { tekst: "#7A5D00", vlak: "#FFF8DB", rand: "#E2B203" },
  laag: { tekst: "#4A5568", vlak: "#F2F4F7", rand: "#A0AEC0" },
  onbekend: { tekst: "#4A5568", vlak: "#F2F4F7", rand: "#A0AEC0" },
  goed: { tekst: "#1B6E3A", vlak: "#E9F6EE", rand: "#34A853" },
};
const LETTER = "font-family:'Segoe UI',Arial,Helvetica,sans-serif;";

export function esc(waarde) {
  return String(waarde ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Alleen http(s)-adressen worden een link. */
function link(url, tekst) {
  if (!/^https?:\/\//i.test(String(url ?? ""))) return esc(tekst);
  return `<a href="${esc(url)}" style="color:#0B5CAD;text-decoration:underline;">${esc(tekst)}</a>`;
}

const meervoud = (n, een, meer) => `${n} ${n === 1 ? een : meer}`;
const opsomming = (lijst) => (lijst.length < 2 ? lijst.join("") : `${lijst.slice(0, -1).join(", ")} en ${lijst.at(-1)}`);
const hoofdletter = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** De onderwerpregel en de statuszin bovenaan. */
export function status(r) {
  if (r.mislukt) {
    return { kort: "controle niet gelukt", onderwerp: `Ochtendcheck ${r.datum.kort} · controle niet gelukt` };
  }
  const n = r.cijfers.nieuwUitgelicht;
  const open = r.cijfers.openUitgelicht;
  let kort;
  if (n > 0) kort = n === 1 ? "1 lek raakt je app" : `${n} lekken raken je apps`;
  else if (open > 0) kort = `niets nieuws, ${meervoud(open, "update staat", "updates staan")} nog open`;
  else if (r.cijfers.nieuwOverig > 0) kort = `${meervoud(r.cijfers.nieuwOverig, "update", "updates")} aanbevolen`;
  else if (r.cijfers.openOverig > 0) kort = "niks dringends";
  else kort = "niks aan de hand";
  if (r.eersteRun && (n > 0 || r.cijfers.nieuwOverig > 0)) kort = `nulmeting: ${kort}`;
  // Een app die niet (helemaal) is nagekeken, mag nooit schuilgaan achter "niks aan de hand".
  const half = r.cijfers.onvolledig ?? 0;
  if (half > 0) {
    const tekst = `${meervoud(half, "app", "apps")} niet volledig gecontroleerd`;
    kort = kort === "niks aan de hand" ? tekst : `${kort}, ${tekst}`;
  }
  return { kort, onderwerp: `Ochtendcheck ${r.datum.kort} · ${kort}` };
}

const MISLUKT =
  "De controle is vandaag niet gelukt: de belangrijkste bron gaf geen antwoord. Je apps zijn dus niet vergeleken. De radar probeert het bij de volgende run opnieuw; start hem met de hand als je niet wilt wachten.";

function intro(r) {
  if (r.mislukt) return MISLUKT;
  const apps = meervoud(r.cijfers.apps, "app", "apps");
  const onderdelen = meervoud(r.cijfers.onderdelen, "onderdeel", "onderdelen");
  const nagelopen = `Ik heb je ${apps} (${onderdelen}) nagelopen op alles wat nu bekend is.`;
  const n = r.cijfers.nieuwGepubliceerd;
  if (n === null) {
    return `${nagelopen} Hoeveel kwetsbaarheden er wereldwijd bij kwamen, is vandaag niet opgehaald.`;
  }
  const periode = r.eersteRun ? "In de afgelopen 24 uur" : "Sinds de vorige check";
  const aantal =
    n === 0
      ? "zijn er geen nieuwe kwetsbaarheden"
      : n === 1
        ? "is er 1 nieuwe kwetsbaarheid"
        : `zijn er ${n} nieuwe kwetsbaarheden`;
  return `${periode} ${aantal} gepubliceerd. ${nagelopen}`;
}

const NAAM = { nodejs: "Node.js", node: "Node.js", postgresql: "PostgreSQL", postgres: "PostgreSQL", mysql: "MySQL", mariadb: "MariaDB", redis: "Redis", mongodb: "MongoDB", php: "PHP", python: "Python", wordpress: "WordPress", drupal: "Drupal", apache: "Apache" };

/** De naam zoals hij in de mail staat. */
export function toonNaam(onderdeel) {
  return onderdeel.ecosysteem === "platform" ? (NAAM[onderdeel.naam.toLowerCase()] ?? onderdeel.naam) : onderdeel.naam;
}

const kap = (tekst, lengte = 120) => (tekst.length > lengte ? `${tekst.slice(0, lengte - 1).trimEnd()}…` : tekst);

function omschrijving(b) {
  // De zwaarste melding waarvan de soort bekend is, bepaalt de kop.
  const m =
    b.meldingen.find((x) => x.ernst === b.ernst && x.soort.kort !== "beveiligingslek") ?? b.meldingen[0];
  const o = b.onderdeel;
  return {
    kop: `${toonNaam(o)} ${o.versie} · ${m.soort.kort}`,
    uitleg: m.soort.uitleg,
    oplossing: b.kwaadaardig
      ? "Verwijder dit pakket en behandel het als een inbraak."
      : b.fix
        ? `Update naar ${b.fix} · ${b.werk}`
        : `Nog geen update beschikbaar · ${b.werk}`,
  };
}

function signalen(b) {
  const uit = [];
  const misbruik = b.meldingen.find((m) => m.misbruikt);
  if (misbruik) {
    uit.push(
      `Wordt actief misbruikt (${misbruik.misbruikt.bron}, sinds ${misbruik.misbruikt.sinds})${misbruik.misbruikt.ransomware ? ", ook door ransomware" : ""}.`,
    );
  }
  const advies = b.meldingen.find((m) => m.ncsc)?.ncsc;
  if (advies) uit.push(`NCSC-advies ${advies.id}: kans ${advies.kans}, schade ${advies.schade}.`);
  const kans = Math.max(0, ...b.meldingen.map((m) => m.epss ?? 0));
  if (kans >= 0.1) uit.push(`Geschatte kans op misbruik binnen 30 dagen: ${Math.round(kans * 100)}% (EPSS).`);
  if (b.tussenstap) {
    uit.push(
      `Kan de nieuwe hoofdversie niet meteen: ${b.tussenstap.versie} lost ${b.tussenstap.lostOp} van de ${b.tussenstap.totaal} meldingen op.`,
    );
  }
  if (b.onderdeel.dev) uit.push("Zit alleen in de ontwikkelomgeving, niet in de live app.");
  else if (b.onderdeel.via?.length) uit.push(`Komt mee met ${opsomming(b.onderdeel.via)}.`);
  else if (b.onderdeel.direct === false) uit.push("Zit indirect in de app: het komt mee met een ander onderdeel.");
  return uit;
}

/* ── HTML ────────────────────────────────────────────────────────────── */

function tegel(getal, label, kleur) {
  return `<td width="32%" align="center" style="${LETTER}background:${kleur.vlak};border:1px solid ${kleur.rand};padding:14px 8px;">
<div style="font-size:26px;line-height:30px;font-weight:600;color:${kleur.tekst};">${esc(getal)}</div>
<div style="font-size:13px;line-height:18px;color:${kleur.tekst};">${esc(label)}</div></td>`;
}

function blok(b) {
  const k = KLEUR[b.ernst];
  const t = omschrijving(b);
  const lijst = b.meldingen.slice(0, 3);
  const meer = b.meldingen.length - lijst.length;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;">
<tr><td width="5" style="background:${k.rand};font-size:0;line-height:0;">&nbsp;</td>
<td style="${LETTER}background:${k.vlak};padding:14px 16px;">
<div style="font-size:13px;line-height:18px;color:${k.tekst};"><b>${esc(b.ernst.toUpperCase())}</b> · ${esc(b.app)} · advies: ${esc(b.advies.toLowerCase())}${b.nieuw ? ' · <b>nieuw</b>' : b.sinds ? ` · open sinds ${esc(b.sinds)}` : ""}</div>
<div style="font-size:16px;line-height:22px;font-weight:600;color:#1F2933;padding-top:4px;">${esc(t.kop)}</div>
<div style="font-size:14px;line-height:20px;color:#3E4C59;padding-top:2px;">${esc(t.uitleg)}</div>
<div style="font-size:14px;line-height:20px;color:#1F2933;padding-top:8px;"><b>Oplossing:</b> ${esc(t.oplossing)}</div>
${signalen(b).map((s) => `<div style="font-size:13px;line-height:19px;color:#3E4C59;padding-top:4px;">${esc(s)}</div>`).join("")}
<div style="font-size:13px;line-height:19px;color:#3E4C59;padding-top:8px;">${lijst
    .map((m) => `${link(m.url, m.cve ?? (m.id.startsWith("nodejs-") ? "nodejs.org" : m.id))}${m.score !== null ? ` (${esc(m.score)})` : ""}: ${esc(kap(m.titel))}`)
    .join("<br>")}${meer > 0 ? `<br>En nog ${meer} ${meer === 1 ? "melding" : "meldingen"} die dezelfde update oplost.` : ""}</div>
</td></tr></table>`;
}

function tabelOverig(lijst) {
  const cel = `${LETTER}font-size:13px;line-height:18px;color:#1F2933;padding:7px 10px;border-bottom:1px solid #E4E7EB;`;
  const kop = `${LETTER}font-size:12px;line-height:16px;color:#52606D;padding:7px 10px;border-bottom:1px solid #CBD2D9;text-align:left;`;
  const getoond = lijst.slice(0, 12);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px 0;border:1px solid #E4E7EB;">
<tr><th style="${kop}">App</th><th style="${kop}">Onderdeel</th><th style="${kop}">Ernst</th><th style="${kop}">Update naar</th></tr>
${getoond
  .map(
    (b) =>
      `<tr><td style="${cel}">${esc(b.app)}</td><td style="${cel}">${esc(toonNaam(b.onderdeel))} ${esc(b.onderdeel.versie)}</td><td style="${cel}color:${KLEUR[b.ernst].tekst};">${esc(b.ernst)}${b.nieuw ? " · nieuw" : ""}</td><td style="${cel}">${esc(b.fix ?? "nog geen update")}</td></tr>`,
  )
  .join("\n")}
</table>${lijst.length > getoond.length ? `<div style="${LETTER}font-size:13px;line-height:19px;color:#52606D;">En nog ${lijst.length - getoond.length} in het rapport.</div>` : ""}`;
}

export function maakHtml(r) {
  const s = status(r);
  const uitgelicht = r.bevindingen.filter((b) => b.niveau <= 1);
  const overig = r.bevindingen.filter((b) => b.niveau > 1);
  const rood = r.cijfers.nieuwUitgelicht > 0 ? KLEUR.kritiek : KLEUR.laag;
  const misbruik = r.cijfers.misbruikt > 0 ? KLEUR.kritiek : KLEUR.goed;
  const alinea = `${LETTER}font-size:15px;line-height:22px;color:#1F2933;`;
  const kopje = `${LETTER}font-size:13px;line-height:18px;font-weight:600;color:#52606D;text-transform:uppercase;letter-spacing:0.4px;padding:22px 0 10px 0;`;

  const delen = [];
  delen.push(`<div style="${LETTER}font-size:22px;line-height:28px;font-weight:600;color:#1F2933;">${esc(s.onderwerp)}</div>`);
  delen.push(`<div style="${alinea}padding-top:16px;">Goedemorgen,</div>`);
  delen.push(`<div style="${alinea}padding-top:10px;">${esc(intro(r))}</div>`);
  if (r.eersteRun && !r.mislukt && r.bevindingen.length) {
    delen.push(`<div style="${alinea}padding-top:10px;">Dit is de eerste run. Alles wat nu open staat, telt daarom als nieuw. Vanaf morgen staat bij elk lek of het nieuw is, of sinds wanneer het open staat.</div>`);
  }
  const tussen = '<td width="2%" style="font-size:0;line-height:0;">&nbsp;</td>';
  delen.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0 0;"><tr>
${tegel(r.cijfers.nieuwGepubliceerd ?? "?", "nieuw gepubliceerd", KLEUR.laag)}
${tussen}
${tegel(r.mislukt ? "?" : r.cijfers.nieuwUitgelicht, r.cijfers.nieuwUitgelicht === 1 ? "raakt jou" : "raken jou", rood)}
${tussen}
${tegel(r.mislukt ? "?" : r.cijfers.misbruikt, "actief misbruikt", r.mislukt ? KLEUR.laag : misbruik)}
</tr></table>`);

  if (uitgelicht.length) {
    delen.push(`<div style="${kopje}">Nu oppakken</div>`);
    delen.push(uitgelicht.slice(0, 8).map(blok).join("\n"));
    if (uitgelicht.length > 8) {
      delen.push(`<div style="${alinea}">En nog ${uitgelicht.length - 8} in het rapport.</div>`);
    }
  }
  if (overig.length) {
    delen.push(`<div style="${kopje}">Minder dringend</div>`);
    delen.push(tabelOverig(overig));
  }
  if (r.rustig.length) {
    delen.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0 0;"><tr>
<td style="${LETTER}background:${KLEUR.goed.vlak};border:1px solid ${KLEUR.goed.rand};padding:12px 16px;font-size:14px;line-height:20px;color:${KLEUR.goed.tekst};"><b>Geen actie nodig:</b> ${esc(r.rustig.join(", "))}</td></tr></table>`);
  }
  if (r.onvolledig?.length) {
    delen.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 0 0;"><tr>
<td style="${LETTER}background:${KLEUR.midden.vlak};border:1px solid ${KLEUR.midden.rand};padding:12px 16px;font-size:14px;line-height:20px;color:${KLEUR.midden.tekst};"><b>Niet volledig gecontroleerd:</b> ${esc(r.onvolledig.join(", "))}. Onder Let op staat waarom.</td></tr></table>`);
  }
  if (r.ncscNieuws.length) {
    delen.push(`<div style="${kopje}">NCSC noemt techniek van je kaart</div>`);
    delen.push(
      `<div style="${LETTER}font-size:14px;line-height:21px;color:#1F2933;">${r.ncscNieuws
        .map((a) => `${link(a.link, a.id)} (kans ${esc(a.kans)}, schade ${esc(a.schade)}): ${esc(a.titel)}. Raakt mogelijk: ${esc(a.raakt.join(", "))}.`)
        .join("<br>")}</div>`,
    );
  }
  if (r.waarschuwingen.length) {
    delen.push(`<div style="${kopje}">Let op</div>`);
    delen.push(
      `<div style="${LETTER}font-size:14px;line-height:21px;color:#1F2933;">${r.waarschuwingen.map((w) => esc(w)).join("<br>")}</div>`,
    );
  }
  if (r.instructiesMail.length) {
    delen.push(`<div style="${kopje}">Voor je developer</div>`);
    delen.push(`<div style="${alinea}">Stuur de instructie hieronder door aan wie de update uitvoert.</div>`);
    for (const ins of r.instructiesMail) {
      delen.push(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 0 0;"><tr><td style="background:#F5F7FA;border:1px solid #E4E7EB;padding:12px 14px;font-family:Consolas,'Courier New',monospace;font-size:12px;line-height:18px;color:#1F2933;white-space:pre-wrap;">${esc(ins.tekst).replace(/\n/g, "<br>")}</td></tr></table>`,
      );
    }
  }
  const bronnen = r.bronnen.filter((b) => b.gelukt).map((b) => b.naam).join(" · ");
  const mislukt = r.bronnen.filter((b) => !b.gelukt);
  delen.push(`<div style="${LETTER}font-size:12px;line-height:18px;color:#7B8794;padding-top:26px;border-top:1px solid #E4E7EB;margin-top:26px;">Bronnen: ${esc(bronnen)}. Alleen gelezen, er is niets aangepast.${
    mislukt.length ? `<br>Geen antwoord van: ${esc(mislukt.map((b) => `${b.naam} (${b.fout})`).join("; "))}.` : ""
  }<br>De radar kijkt naar bekende kwetsbaarheden in de onderdelen op je techniekkaart. Fouten in je eigen code, instellingen en wachtwoorden ziet hij niet.</div>`);

  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(s.onderwerp)}</title></head>
<body style="margin:0;padding:0;background:#F5F7FA;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#FFFFFF;border:1px solid #E4E7EB;"><tr><td style="padding:28px 28px 30px 28px;">
${delen.join("\n")}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

/* ── Platte tekst en rapport ─────────────────────────────────────────── */

export function maakTekst(r) {
  const s = status(r);
  const regels = [s.onderwerp, "", "Goedemorgen,", "", intro(r), ""];
  if (r.eersteRun && !r.mislukt && r.bevindingen.length) {
    regels.push("Dit is de eerste run. Alles wat nu open staat, telt daarom als nieuw. Vanaf morgen staat bij elk lek of het nieuw is, of sinds wanneer het open staat.", "");
  }
  regels.push(
    r.mislukt
      ? `Nieuw gepubliceerd: ${r.cijfers.nieuwGepubliceerd ?? "onbekend"}`
      : `Nieuw gepubliceerd: ${r.cijfers.nieuwGepubliceerd ?? "onbekend"} | Raakt jou: ${r.cijfers.nieuwUitgelicht} | Actief misbruikt: ${r.cijfers.misbruikt}`,
    "",
  );
  const uitgelicht = r.bevindingen.filter((b) => b.niveau <= 1);
  const overig = r.bevindingen.filter((b) => b.niveau > 1);
  if (uitgelicht.length) {
    regels.push("NU OPPAKKEN", "");
    for (const b of uitgelicht) {
      const t = omschrijving(b);
      regels.push(
        `${b.ernst.toUpperCase()} · ${b.app} · advies: ${b.advies.toLowerCase()}${b.nieuw ? " · nieuw" : ""}`,
        t.kop,
        t.uitleg,
        `Oplossing: ${t.oplossing}`,
        ...signalen(b),
        ...b.meldingen.slice(0, 3).map((m) => `- ${m.cve ?? (m.id.startsWith("nodejs-") ? "Node.js" : m.id)}: ${kap(m.titel)} ${m.url}`),
        "",
      );
    }
  }
  if (overig.length) {
    regels.push("MINDER DRINGEND", "");
    for (const b of overig) {
      regels.push(`- ${b.app}: ${toonNaam(b.onderdeel)} ${b.onderdeel.versie}, ${b.ernst}, update naar ${b.fix ?? "nog geen update"}`);
    }
    regels.push("");
  }
  if (r.rustig.length) regels.push(`Geen actie nodig: ${r.rustig.join(", ")}`, "");
  if (r.onvolledig?.length) regels.push(`Niet volledig gecontroleerd: ${r.onvolledig.join(", ")}. Onder Let op staat waarom.`, "");
  for (const a of r.ncscNieuws) regels.push(`NCSC ${a.id} (${a.kans}/${a.schade}): ${a.titel}. Raakt mogelijk: ${a.raakt.join(", ")}. ${a.link}`);
  if (r.ncscNieuws.length) regels.push("");
  if (r.waarschuwingen.length) regels.push("LET OP", ...r.waarschuwingen.map((w) => `- ${w}`), "");
  for (const ins of r.instructiesMail) regels.push("VOOR JE DEVELOPER", "", ins.tekst, "");
  regels.push(
    `Bronnen: ${r.bronnen.filter((b) => b.gelukt).map((b) => b.naam).join(", ")}. Alleen gelezen, er is niets aangepast.`,
  );
  const mislukt = r.bronnen.filter((b) => !b.gelukt);
  if (mislukt.length) regels.push(`Geen antwoord van: ${mislukt.map((b) => `${b.naam} (${b.fout})`).join("; ")}.`);
  return regels.join("\n");
}

/** Het volledige rapport in Markdown: alle bevindingen, ook de kleine. */
export function maakRapport(r) {
  const s = status(r);
  const regels = [`# ${s.onderwerp}`, "", intro(r), ""];
  regels.push(
    "| Nieuw gepubliceerd | Raakt jou (nieuw) | Actief misbruikt | Open in totaal |",
    "| --- | --- | --- | --- |",
    `| ${r.cijfers.nieuwGepubliceerd ?? "onbekend"} | ${r.cijfers.nieuwUitgelicht} | ${r.cijfers.misbruikt} | ${r.bevindingen.length} |`,
    "",
  );
  if (r.mislukt) return regels.concat(`Bronnen: ${r.bronnen.map((b) => `${b.naam}${b.gelukt ? "" : " (geen antwoord)"}`).join(", ")}.`).join("\n");
  if (!r.bevindingen.length) regels.push("Geen bekende kwetsbaarheden in de onderdelen op de techniekkaart.", "");
  for (const app of r.apps) {
    const lijst = r.bevindingen.filter((b) => b.app === app.naam);
    regels.push(`## ${app.naam}`, "", `${meervoud(app.aantal, "onderdeel", "onderdelen")} gecontroleerd.`, "");
    if (!lijst.length) {
      regels.push("Geen actie nodig.", "");
      continue;
    }
    regels.push("| Onderdeel | Versie | Ernst | Advies | Update naar | Meldingen |", "| --- | --- | --- | --- | --- | --- |");
    for (const b of lijst) {
      const ids = b.meldingen.map((m) => `[${m.cve ?? (m.id.startsWith("nodejs-") ? "nodejs.org" : m.id)}](${m.url})`).join(", ");
      regels.push(
        `| ${toonNaam(b.onderdeel)} | ${b.onderdeel.versie} | ${b.ernst}${b.misbruikt ? ", actief misbruikt" : ""} | ${b.advies} | ${b.fix ?? "nog geen update"} | ${ids} |`,
      );
    }
    regels.push("");
  }
  if (r.waarschuwingen.length) regels.push("## Let op", "", ...r.waarschuwingen.map((w) => `- ${w}`), "");
  regels.push(
    `Bronnen: ${r.bronnen.map((b) => `${b.naam}${b.gelukt ? "" : " (geen antwoord)"}`).join(", ")}.`,
  );
  return regels.join("\n");
}

export { hoofdletter };
