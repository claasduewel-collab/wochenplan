# Wochenplan – Lidl Lüneburg

Jeden Sonntag liest dieses Projekt automatisch den neuen Lidl-Prospekt, plant daraus
7 Tage Essen (Makros, keine Reste, möglichst günstig) und zeigt alles in der App.

- App: `https://<dein-github-name>.github.io/<repo-name>/`
- Neu planen: Reiter **Actions → Wochenplan → Run workflow**
- Ziele, No-Gos, Normalpreise ändern: `config.json` bearbeiten (Stift-Symbol)
- Benötigt das Secret `GEMINI_API_KEY` (Settings → Secrets and variables → Actions)

Falls ein Lauf mit „model not found“ scheitert: in `config.json` bei `"modell"` ein aktuelles
Gemini-Modell eintragen (Liste in Google AI Studio).
