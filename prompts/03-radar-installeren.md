# De radar laten installeren door Claude Code

**Waar:** Claude Code, in een lege map.

**Wanneer:** Je wilt de radar aan de praat krijgen zonder zelf alle opdrachten te typen.

```text
Help me de kwetsbaarheden-radar in gebruik te nemen. Dat is een open source programma van Pilex dat elke ochtend controleert of er een nieuw beveiligingslek in mijn apps zit en daar een mail over stuurt. De repository staat op https://github.com/Pilex-B-V/kwetsbaarheden-radar.

Werk in stappen en vraag mijn akkoord voor je iets aanmaakt of verstuurt.

Stap 1. Lees de README en docs/outlook-instellen.md van de repository en vat in tien regels samen wat we gaan doen.

Stap 2. Controleer of git, Node.js 20 of hoger en de GitHub-opdracht gh op deze computer staan. Ontbreekt er iets, zeg dan hoe ik het installeer en wacht.

Stap 3. Maak van de repository een eigen kopie in mijn GitHub-account. De kopie moet privé zijn. Gebruik de sjabloonfunctie van GitHub (gh repo create met --template en --private) en haal de kopie daarna binnen in deze map. Laat me de naam kiezen.

Stap 4. Draai "npm run voorbeeld" en laat me de uitkomst zien, zodat ik weet dat het werkt.

Stap 5. Maak techniekkaart.json aan. Vraag me per app om de gegevens, of om het JSON-blok dat ik eerder met de prompt voor de techniekkaart heb gemaakt. Controleer de kaart met "node src/radar.mjs --droog".

Stap 6. Leg uit welke secrets ik in GitHub moet zetten voor de mail en eventueel voor het ophalen van lockfiles. Zet ze er niet zelf in: ik plak de waarden in GitHub. Typ of toon nooit een geheim in dit gesprek of in een bestand.

Stap 7. Zet de wijzigingen in mijn privékopie en start de taak Ochtendcheck één keer met de hand. Laat zien of hij is geslaagd.

Regels:
- Zet niets in een openbare repository.
- Verander de code van de radar niet, behalve techniekkaart.json.
- Loopt iets vast, leg dan uit wat er gebeurt en wat de opties zijn. Probeer niet zelf om beveiligingen heen te werken.
```
