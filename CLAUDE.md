# Kwetsbaarheden-radar: handleiding voor Claude

Deze repository is een klein programma dat elke ochtend controleert of een nieuw
bekend lek de apps van de gebruiker raakt, en daar één mail over stuurt. De
gebruiker is meestal een ondernemer of manager, geen programmeur. Praat
Nederlands, in gewone taal, en leg een vakwoord uit de eerste keer dat je het
gebruikt.

## Wat je doet als iemand deze repository net heeft binnengehaald

Vraagt de gebruiker om de radar in te stellen, te installeren, te testen of uit
te rollen, of zegt hij alleen iets als "help me hiermee" of "ga aan de slag":
volg dan de stappen in `.claude/skills/radar-instellen/SKILL.md`. Dat zijn drie
fasen, in deze volgorde:

1. **Lokaal testen.** Het voorbeeld draaien, de eigen apps op de techniekkaart
   zetten en een droge run doen. Er wordt niets verstuurd.
2. **De mail koppelen.** De gebruiker vult de instellingen in `.env` in en
   verstuurt één proefmail.
3. **Uitrollen.** De radar zo neerzetten dat hij elke ochtend vanzelf draait:
   in GitHub Actions (aanbevolen) of op een eigen computer of server.

Begin altijd met fase 1. Rol niets uit voordat de droge run klopt en de
gebruiker de uitkomst heeft gezien.

Een app toevoegen aan de kaart: volg `.claude/skills/app-toevoegen/SKILL.md`.

## Wat je van de gebruiker nodig hebt

Vertel dit aan het begin, zodat de gebruiker weet wat er komt. Vraag daarna één
ding tegelijk.

| Voor | Wat je nodig hebt | Wie het kan leveren |
| --- | --- | --- |
| De techniekkaart | Welke apps er zijn, en per app waar de code staat: een map op deze computer of een repository op GitHub | De gebruiker of de bouwer van de app |
| De techniekkaart | Per app: wie de eigenaar is, wie updates uitvoert, of er gevoelige gegevens in staan en of de app vanaf het internet bereikbaar is | De gebruiker |
| Lockfiles uit afgeschermde repositories | Een token dat alleen mag lezen (`RADAR_GITHUB_TOKEN`) | De gebruiker maakt het zelf aan in GitHub |
| De mail in Outlook | Vijf waarden uit Microsoft 365, zie `docs/outlook-instellen.md` | Een beheerder van Microsoft 365 |
| Uitrollen in GitHub | Een GitHub-account en de opdracht `gh`, ingelogd | De gebruiker |

Kan de gebruiker iets nog niet leveren, ga dan door met wat wel kan en zet het
op de lijst met open punten. De radar is ook zonder mail te testen.

## Regels

- **Geheimen.** Wachtwoorden, tokens en secrets horen alleen in `.env` of in de
  secrets van GitHub. De gebruiker typt ze daar zelf in. Vraag er niet om in het
  gesprek en zet ze niet in een opdracht. Open `.env` niet, ook niet met een
  opdracht zoals `cat` of `type`. Welke namen zijn ingevuld, zie je aan de regel
  Instellingen gelezen uit .env die de radar afdrukt.
- **Afgeschermd.** `techniekkaart.json` en de map `uit` laten zien waar de apps
  kwetsbaar zijn. Zet ze alleen in een repository die op privé staat. Controleer
  dat voordat je iets met een kaart naar GitHub stuurt.
- **Alleen lezen bij de apps.** In de mappen en repositories van de apps van de
  gebruiker lees je alleen. Je past daar niets aan en installeert er niets,
  tenzij de gebruiker daar apart om vraagt.
- **Eerst zeggen, dan doen.** Zeg wat je gaat doen en vraag akkoord voordat je
  een repository aanmaakt, iets naar GitHub stuurt, een mail verstuurt of een
  geplande taak aanmaakt.
- **De code van de radar.** Verander `src` en `.github` niet tijdens het
  instellen. Werkt iets niet, zoek dan eerst in de handleiding.
- **Niet raden.** Weet je een versie, een naam of een pad niet zeker, zeg dat en
  vraag het na. Een verkeerde versie op de kaart geeft een verkeerde uitkomst.

## De opdrachten

| Opdracht | Wat het doet |
| --- | --- |
| `npm run voorbeeld` | De radar op drie verzonnen apps. Verstuurt en onthoudt niets |
| `npm run droog` | De radar op `techniekkaart.json`. Verstuurt en onthoudt niets |
| `npm run proefmail` | Verstuurt één proefmail met de instellingen uit `.env`. Onthoudt niets |
| `npm run radar` | De echte run: verstuurt de mail en onthoudt wat hij zag |
| `node src/kaart.mjs <lockfile> --naam "App" --schrijf` | Zet een app met al zijn onderdelen in de kaart |
| `npm test` | De tests, zonder internet |

Node.js 20 of hoger is nodig. Er zijn geen pakketten om te installeren.

Na elke run staat in de map `uit`: `ochtendmail.html` (zo ziet de mail eruit),
`rapport.md` (alles, ook wat minder dringend is) en per app een instructie voor
de developer. Laat de gebruiker `uit/ochtendmail.html` in de browser openen.

## Waar wat staat

| Pad | Wat |
| --- | --- |
| `README.md` | De handleiding voor mensen |
| `docs/outlook-instellen.md` | De mail koppelen aan Outlook, klik voor klik |
| `docs/altijd-laten-draaien.md` | Uitrollen: GitHub Actions of een eigen computer |
| `docs/hoe-het-werkt.md` | Hoe de radar ernst, advies en herstelversie bepaalt |
| `voorbeeld/techniekkaart.json` | Een uitgewerkte kaart |
| `.env.voorbeeld` | Alle instellingen, met uitleg |
| `prompts/` | Prompts voor het opvolgen van een mail |
| `src/radar.mjs`, `src/lib/` | Het programma |

## De uitkomst uitleggen

- **Nu oppakken** is alles met het advies vandaag of deze week. Begin daar.
- **Niet volledig gecontroleerd** betekent dat een lockfile niet te lezen was,
  dat de radar een platformnaam niet kent, of dat NVD of nodejs.org geen antwoord
  gaf. Onder Let op staat waarom. Een lockfile of een naam los je op voordat je
  uitrolt. Gaf een bron geen antwoord, draai dan later opnieuw. Een app waarvan
  de gebruiker de code niet kan leveren, haal je van de kaart en zet je op de
  lijst met open punten.
- De eerste run is de nulmeting en kan een lange lijst geven. Eén update lost
  vaak tientallen meldingen op.
- De radar ziet bekende lekken in onderdelen. Fouten in de eigen code en in
  instellingen ziet hij niet. Zeg dat erbij, ook als de uitkomst niks aan de
  hand is.

## Als je aan de radar zelf werkt

Alleen als de gebruiker daar om vraagt. Geen pakketten van derden toevoegen. Bij
elke wijziging hoort een test in `test/`, en `npm test` moet slagen. Namen en
commentaar zijn in het Nederlands. Tekst uit een bron gaat in de mail altijd
door `esc()`.
