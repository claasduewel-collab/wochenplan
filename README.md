# Wochenplan

Meal-Prep-Wochenplaner fürs iPhone: liest jede Woche die Prospekt-Angebote, plant daraus Frühstück, Snack,
Mittag und Abend (günstig, High Protein, möglichst ohne Reste) und führt Einkaufsliste und Vorrat.

- **App:** `https://<dein-github-name>.github.io/wochenplan/` → in Safari öffnen → Teilen → „Zum Home-Bildschirm“
- **Planung passiert in der App** (sofort, ohne Wartezeit): Laden und Personenzahl wählen, Gerichte tauschen,
  Rezepte nach Gerät filtern (Heißluftfritteuse, Backofen …), Einkauf abhaken, Vorrat pflegen.
- **Angebote** holt jeden Sonntag ein GitHub-Lauf (`update.mjs`) aus dem Prospekt und schreibt sie in `plan.json`.

## Einmalig einrichten: Gemini-Schlüssel

Das Ablesen der Prospektseiten macht Google Gemini (kostenloses Kontingent reicht).

1. Auf <https://aistudio.google.com/apikey> einen API-Schlüssel erstellen und kopieren.
2. Im Repository: **Settings → Secrets and variables → Actions → New repository secret**,
   Name `GEMINI_API_KEY`, Schlüssel einfügen. (Ein vorhandenes Secret mit „Update“ überschreiben.)
3. **Actions → Wochenplan → Run workflow** – nach ein paar Minuten stehen die Angebote in der App.

Ohne gültigen Schlüssel funktioniert die App trotzdem, rechnet dann aber mit Normalpreisen.

## Aufbau

| Datei | Zweck |
| --- | --- |
| `index.html`, `app.js`, `app.css` | Oberfläche |
| `planer.js` | Rechenkern: Portionen, Packungen, Reste, Vorrat, Planung |
| `daten/katalog.json` | Produkte mit Packungsgröße, Normalpreis, Nährwerten |
| `daten/rezepte.json` | Alle Rezepte (wird aus `werkzeug/rezepte/*.json` gebaut) |
| `plan.json` | Angebote der Woche je Laden (schreibt `update.mjs`) |
| `config.json` | Startwerte: Personen, Ziele, Mahlzeiten, Abneigungen, Läden |

Rezepte oder Produkte ändern:

```sh
node werkzeug/katalog-quelle.mjs   # Produkte: in dieser Datei pflegen
node werkzeug/bauen.mjs            # Rezepte prüfen und daten/rezepte.json bauen
node --test test/planer.test.mjs test/update.test.mjs
```

Neue Läden: in `update.mjs` unter `QUELLEN` eine Funktion ergänzen, die die Prospektseiten (Bild-URLs) liefert,
und den Laden in `config.json` unter `laeden` eintragen. Aktuell wird Lidl automatisch gelesen.
