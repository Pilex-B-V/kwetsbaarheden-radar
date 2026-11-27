# Hoe de radar tot zijn oordeel komt

Alles in de mail is terug te voeren op een bron en een vaste regel. Er zit geen
taalmodel in de radar. Vergelijken is rekenwerk, en rekenwerk hoort elke dag
dezelfde uitkomst te geven.

## De stappen van één run

1. **Kaart lezen.** De radar leest `techniekkaart.json` en de lockfiles waar de
   kaart naar verwijst. Een lockfile is het bestand waarin precies staat welke
   onderdelen, in welke versie, in een app zitten.
2. **Vergelijken.** Voor elk onderdeel vraagt hij aan OSV.dev welke bekende
   kwetsbaarheden er zijn voor precies die versie. Hij stuurt daarbij alleen
   ecosysteem, naam en versie mee.
3. **Platform nalopen.** Staat er Node.js op de kaart, dan kijkt hij op
   nodejs.org welke beveiligingsreleases je hebt gemist. Voor een database of
   webserver vraagt hij NVD welke kwetsbaarheden bij jouw versie horen.
4. **Verrijken.** Per kwetsbaarheid zoekt hij op of die actief wordt misbruikt
   (CISA KEV en EUVD), hoe groot de kans daarop is (EPSS) en of het NCSC er een
   advies over heeft. Naar EPSS en EUVD stuurt hij daarvoor het nummer van de
   kwetsbaarheid.
5. **Beoordelen.** Per app en per onderdeel bepaalt hij de ernst, de versie die
   het oplost, hoeveel werk dat is en hoe snel het moet.
6. **Vergelijken met gisteren.** Wat hij nog niet eerder zag, krijgt het label
   nieuw.
7. **Mail maken en versturen.**

## De bronnen

| Bron | Wat de radar eruit haalt | Van wie |
| --- | --- | --- |
| [OSV.dev](https://osv.dev) | Kwetsbaarheden per pakket en versie. Bevat onder meer de GitHub Advisory Database en meldingen over kwaadaardige pakketten | Google, open source |
| [NVD](https://nvd.nist.gov) | Hoeveel CVE's er sinds de vorige run zijn gepubliceerd, en kwetsbaarheden in platformonderdelen | NIST, Verenigde Staten |
| [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) | Of een kwetsbaarheid aantoonbaar wordt misbruikt | CISA, Verenigde Staten |
| [EUVD](https://euvd.enisa.europa.eu) | Het Europese nummer van een kwetsbaarheid en of ENISA misbruik heeft vastgelegd | ENISA, Europese Unie |
| [EPSS](https://www.first.org/epss/) | De geschatte kans op misbruik binnen 30 dagen | FIRST |
| [NCSC](https://advisories.ncsc.nl) | Beveiligingsadviezen met kans en schade | Nederlandse overheid |
| [nodejs.org](https://nodejs.org/en/blog/vulnerability) | Beveiligingsreleases van Node.js | Node.js-project |

Geeft een bron geen antwoord, dan gaat de run door en staat onderaan de mail
welke bron ontbrak. Kon een deel van een app daardoor niet worden nagekeken, of
was een lockfile niet te lezen, dan staat die app onder Niet volledig
gecontroleerd en nooit onder Geen actie nodig. Alleen als OSV.dev uitvalt, is er niets te vergelijken. De
mail zegt dan dat de controle niet is gelukt, en de taak in GitHub wordt rood.

## Ernst

De radar neemt de ernst over van de bron: kritiek, hoog, midden of laag. Staat
er alleen een CVSS-vector (versie 3.0 of 3.1), dan rekent hij de score zelf uit
volgens de specificatie van FIRST: 9,0 en hoger is kritiek, 7,0 en hoger is
hoog, 4,0 en hoger is midden. Een pakket dat als kwaadaardig is gemeld, telt
altijd als kritiek.

Voor gemiste beveiligingsreleases van Node.js geeft nodejs.org geen ernst per
release mee in de lijst die de radar leest. De radar gaat dan uit van hoog en
zegt dat erbij.

## Hoe snel het moet

| Advies | Wanneer |
| --- | --- |
| Vandaag | Het lek wordt actief misbruikt, het pakket is kwaadaardig, of de ernst is kritiek |
| Deze week | De ernst is hoog |
| Bij het volgende onderhoud | De ernst is midden of onbekend |
| Geen haast | De ernst is laag |

Drie dingen op de kaart verschuiven dat:

- **Gevoelige app aan het internet.** Staat `gevoeligheid` op `hoog` en is de app
  bereikbaar vanaf het internet, dan wordt hoog ook vandaag.
- **Alleen intern bereikbaar.** Staat `bereikbaar` op `intern`, dan schuift het
  advies één stap op: kritiek wordt deze week.
- **Alleen in de ontwikkelomgeving.** Een onderdeel dat niet in de live app zit,
  schuift ook één stap op.

Actief misbruik en kwaadaardige pakketten blijven altijd vandaag.

Bovenaan de mail, onder Nu oppakken, staat alles met het advies vandaag of deze
week. De rest staat in de tabel Minder dringend en volledig in `rapport.md`.

## De versie die het oplost

Een melding beschrijft per versielijn vanaf welke versie het lek erin zit en in
welke versie het is opgelost. De radar zoekt de lijn waar jouw versie in valt en
neemt de herstelversie daarvan. Heeft een onderdeel meer meldingen, dan noemt hij
de laagste versie die ze allemaal oplost.

Een voorbeeld. Je draait Next.js 15.2.2. Eén melding is opgelost in 15.2.3, een
andere in 15.5.29. De mail zegt dan: update naar 15.5.29.

## Hoeveel werk het is

Dit is een indicatie op basis van de grootte van de versiesprong. Het is geen
toezegging: hoeveel tijd het echt kost, hangt af van je app en je tests.

| Sprong | Voorbeeld | Wat de mail zegt |
| --- | --- | --- |
| Klein | 15.2.2 naar 15.2.3 | ongeveer 10 minuten werk, plus testen |
| Middel | 15.2.2 naar 15.5.29 | een halfuur tot een uur werk, plus testen |
| Groot | 3.24.2 naar 4.6.6 | een nieuwe hoofdversie: plan een dagdeel en test goed |

## Soort lek in gewone taal

Elke melding heeft een of meer CWE-nummers: een internationale indeling van
soorten zwakke plekken. De radar vertaalt die naar een korte omschrijving, zoals
lek in de toegangscontrole of app platleggen. Noemt een melding meer soorten,
dan wint het zwaarste gevolg. De vertaaltabel staat in
[`src/lib/beoordeel.mjs`](../src/lib/beoordeel.mjs).

## Wat nieuw is

Elke mail laat alles zien wat open staat. Bij elk lek staat of het nieuw is, of
sinds wanneer het open staat. De radar onthoudt daarvoor in de map `.radar`
welke combinaties van app, onderdeel, versie en melding hij al zag. In GitHub Actions blijft die map bewaard via de cache.
Raakt de cache een keer leeg, dan telt de eerstvolgende mail alles als nieuw. Er
gaat verder niets verloren.

## Wat de radar niet ziet

- Fouten in je eigen code, zoals een pagina die je bent vergeten af te schermen.
- Instellingen: een open database, een zwak wachtwoord, een sleutel in de code.
- Onderdelen die niet op de kaart staan.
- Kwetsbaarheden die nog niet openbaar zijn gemeld.
- Of een lek in jouw app ook echt te misbruiken is. De radar ziet dat het
  onderdeel erin zit, niet of je de getroffen functie gebruikt.

De radar vervangt dus geen beveiligingstest. Hij zorgt dat je een bekend lek in
een onderdeel niet mist.
