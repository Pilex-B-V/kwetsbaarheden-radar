---
name: radar-instellen
description: Stelt de kwetsbaarheden-radar in met de gebruiker, in drie fasen: lokaal testen, de mail koppelen en uitrollen zodat hij elke ochtend vanzelf draait. Gebruik dit als de gebruiker de repository net heeft binnengehaald, of vraagt om de radar in te stellen, te installeren, te testen of uit te rollen.
---

# De radar instellen

Je begeleidt de gebruiker van een verse kopie naar een radar die elke ochtend
draait. Werk de fasen in volgorde af. Houd je aan de regels in `CLAUDE.md`:
geheimen alleen in `.env`, eerst zeggen en dan doen, alleen lezen bij de apps.

Sla een fase over als die al klaar is. Kijk daarvoor eerst wat er al staat.

## Vooraf: kijk wat er is

Doe dit zonder iets te vragen:

1. `node --version`: moet 20 of hoger zijn. Is het lager of ontbreekt Node.js,
   leg dan uit hoe de gebruiker het installeert via nodejs.org en wacht.
2. `git remote -v`: waar komt deze kopie vandaan.
3. Bestaat `techniekkaart.json` al? Bestaat `.env` al? Lees `.env` niet.
4. `gh auth status`: is de gebruiker ingelogd bij GitHub. Dit is pas nodig in
   fase 3; meld het alleen. Ontbreekt de opdracht `gh`, zeg dan dat die van
   cli.github.com komt en dat hij voor het uitrollen nodig is.

Vertel daarna in een paar regels wat jullie gaan doen (de drie fasen) en wat je
van de gebruiker nodig hebt. Gebruik de tabel uit `CLAUDE.md`. Vraag of je mag
beginnen met het voorbeeld.

## Fase 1: lokaal testen

Doel: de gebruiker ziet met eigen ogen wat de radar bij zijn apps vindt, zonder
dat er iets wordt verstuurd.

1. **Het voorbeeld.** Draai `npm run voorbeeld`. Leg de uitkomst uit in drie
   zinnen en laat de gebruiker `uit/ochtendmail.html` in de browser openen.
2. **De eigen apps.** Vraag welke apps de gebruiker in het bedrijf heeft
   draaien. Begin met één: de app waar klantgegevens in staan en die aan het
   internet hangt. Zet hem op de kaart volgens
   `.claude/skills/app-toevoegen/SKILL.md`.
3. **De droge run.** Draai `npm run droog`. Bespreek:
   - wat er onder Nu oppakken staat, en welke update het meeste oplost;
   - of er iets onder Niet volledig gecontroleerd staat. Los dat eerst op;
   - dat dit de nulmeting is: een lange lijst is normaal bij een app die een
     tijd niet is bijgewerkt.
4. Vraag of de gebruiker nog een app wil toevoegen. Herhaal stap 2 en 3.

Klaar als: de droge run alle apps volledig heeft gecontroleerd en de gebruiker
de mail in de browser heeft gezien.

## Fase 2: de mail koppelen

Vraag hoe de gebruiker de mail wil ontvangen:

- **In Outlook (Microsoft 365).** Daarvoor is een beheerder van Microsoft 365
  nodig. Loop `docs/outlook-instellen.md` met de gebruiker door. De beheerder
  voert de stappen in Entra en PowerShell uit; jij legt uit wat elke stap doet.
- **Via een webhook** (Power Automate, n8n, Make of Teams). De gebruiker heeft
  dan alleen het adres van de webhook nodig.
- **Later.** Ga dan door naar fase 3. De radar draait ook zonder mail; het
  rapport staat dan bij elke run. Zet de mail op de lijst met open punten.

De instellingen:

1. Bestaat `.env` nog niet, maak hem dan aan met `cp .env.voorbeeld .env`.
2. Laat de gebruiker `.env` zelf openen in een editor en de waarden invullen.
   Open het bestand niet, ook niet met een opdracht, en vraag niet naar de
   waarden.
3. Draai `npm run proefmail`. De eerste regel noemt welke instellingen zijn
   gelezen. Ontbreekt er een, dan zegt de melding welke.
4. Vraag of de proefmail is aangekomen. Het onderwerp begint met Proef.

Loopt het vast:

| Melding | Wat er aan de hand is |
| --- | --- |
| `Outlook is half ingesteld` | Een van de vijf waarden ontbreekt in `.env`. De melding noemt welke |
| `login.microsoftonline.com: status 400` of `401` | Het tenant-ID, het client-ID of het secret klopt niet, of het secret is verlopen |
| `graph.microsoft.com: status 403` | De rechten zijn nog niet doorgekomen. Dat duurt 30 minuten tot 2 uur. Ga intussen door met fase 3 |
| `graph.microsoft.com: status 404` | Het adres bij `RADAR_MAIL_VAN` is geen bestaand postvak |

## Fase 3: uitrollen

Doel: de radar draait elke ochtend vanzelf, ook als de computer van de gebruiker
uit staat. De volledige uitleg staat in `docs/altijd-laten-draaien.md`.

Vraag waar de radar moet draaien:

- **GitHub Actions (aanbevolen).** Gratis, de computer hoeft niet aan te staan.
- **Een eigen computer of server.** Als de gebruiker geen GitHub wil gebruiken.
  Volg dan het tweede deel van `docs/altijd-laten-draaien.md`.

### GitHub Actions

1. **Inloggen.** `gh auth status`. Is de gebruiker niet ingelogd, laat hem dan
   zelf `gh auth login` draaien.
2. **Een eigen, afgeschermde repository.** Kijk met `git remote -v` waar
   `origin` heen wijst.
   - Naar `Pilex-B-V/kwetsbaarheden-radar`: maak die koppeling los met
     `git remote remove origin`.
   - Ergens anders heen: draai `gh repo view --json visibility,isFork`. Is die
     repository `PUBLIC` of een fork, stuur er dan niets heen. Maak `origin` los
     en maak een nieuwe, afgeschermde repository. Is hij `PRIVATE` en geen fork,
     vraag dan of de gebruiker die wil gebruiken en sla stap 4 over.

   Laat geen tweede koppeling staan: met twee koppelingen weigert
   `gh secret set` te werken. Vraag onder welk account of welke organisatie de
   repository moet komen en hoe hij moet heten.
3. **De kaart vastleggen.** `git add techniekkaart.json` en
   `git commit -m "Techniekkaart"`. Controleer met `git status` dat `.env` en
   `uit` niet meegaan. Vraagt Git wie de gebruiker is, laat hem dan zelf
   `git config user.name "..."` en `git config user.email "..."` draaien.
4. **Aanmaken en versturen.** Na akkoord:
   `gh repo create <eigenaar>/<naam> --private --source=. --remote=origin --push`.
   Controleer daarna: `gh repo view --json visibility` moet `PRIVATE` geven.
5. **De instellingen.** `gh secret set -f .env` zet alles wat in `.env` is
   ingevuld als secret in de repository, zonder dat de waarden in beeld komen.
   Controleer de namen met `gh secret list`. Bestaat `.env` niet, omdat de mail
   is uitgesteld en er geen token nodig is, sla deze stap dan over.
6. **Lockfiles uit afgeschermde repositories.** Staat er op de kaart een bron
   van de soort `github` naar een afgeschermde repository, dan is
   `RADAR_GITHUB_TOKEN` nodig. De stappen staan in de README onder Het leestoken voor GitHub. De
   gebruiker zet het token in `.env`; daarna draai je stap 5 opnieuw.
7. **De eerste run.** `gh workflow run ochtendcheck.yml`. Wacht een paar
   seconden en zoek het nummer van de run op met
   `gh run list --workflow ochtendcheck.yml --limit 1`. Volg hem met
   `gh run watch <nummer>` en lees de uitkomst met `gh run view <nummer> --log`.
   Het rapport staat ook in GitHub, onder Actions, bij de run.
8. **Controleren.** Is de mail aangekomen? Staat er niets onder Niet volledig
   gecontroleerd?

Vanaf nu start de taak elke ochtend om 07:40 Nederlandse tijd.

## Afronden

Sluit af met een kort overzicht:

- welke apps op de kaart staan en waar de radar draait;
- wat er onder Nu oppakken staat, en dat de instructie voor de developer in de
  mail en in de map `uit` staat;
- de open punten, bijvoorbeeld de mail of een app zonder toegang tot de code;
- wat de gebruiker in de agenda zet: de einddatum van het client secret en van
  het token voor GitHub. Daarna stopt de mail of leest de radar de lockfiles
  niet meer;
- dat een tweede persoon de mail hoort te krijgen (`RADAR_MAIL_AAN`, meer
  adressen met een komma ertussen);
- dat de radar bekende lekken in onderdelen ziet, en geen fouten in de eigen
  code of instellingen.

Een nieuwe versie van de radar haal je later op met
`git pull --no-rebase --no-edit https://github.com/Pilex-B-V/kwetsbaarheden-radar.git main`, gevolgd door `git push`.
