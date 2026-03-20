# Festplatz Messpunkte

Messpunkte per Telegram-Bot erfassen und auf einer interaktiven Satellitenkarte anzeigen.

## Übersicht

| Komponente | Beschreibung |
|---|---|
| **Telegram Bot** (`bot/`) | Python-Bot — Standort senden → Bezeichnung eingeben → wird in JSON gespeichert |
| **Karte** (`index.html`) | Leaflet-Karte mit Satellit/Straße/Topo-Ansicht, gehostet via GitHub Pages |
| **Daten** (`data/messpunkte.json`) | Alle Messpunkte als JSON |

## Telegram Bot einrichten

1. Bot bei [@BotFather](https://t.me/BotFather) erstellen und Token kopieren
2. Abhängigkeiten installieren:
   ```bash
   cd bot
   pip install -r requirements.txt
   ```
3. Token als Umgebungsvariable setzen:
   ```bash
   export TELEGRAM_BOT_TOKEN="DEIN_TOKEN"
   ```
4. Bot starten:
   ```bash
   python bot.py
   ```

### Bot-Befehle

| Befehl | Funktion |
|---|---|
| `/start` | Hilfe anzeigen |
| `/liste` | Alle Messpunkte auflisten |
| `/loesche <id>` | Messpunkt löschen |
| *Standort senden* | Neuen Messpunkt erfassen |

## Karte (GitHub Pages)

Die Datei `index.html` im Root wird direkt von GitHub Pages ausgeliefert.  
Messpunkte werden aus `data/messpunkte.json` geladen.

### Kartenmodi
- **Satellit** — Esri World Imagery
- **Straße** — CARTO Dark
- **Topografisch** — CARTO Light

## JSON-Format

```json
{
  "messpunkte": [
    {
      "id": 1,
      "name": "Messpunkt Bühne",
      "lat": 51.123456,
      "lon": 10.654321,
      "timestamp": "2026-03-20T14:30:00+00:00"
    }
  ]
}
```

## Workflow

1. Handy: Standort an Telegram-Bot senden
2. Bot fragt nach Bezeichnung
3. Messpunkt wird in `data/messpunkte.json` gespeichert
4. JSON ins Repo committen & pushen
5. GitHub Pages zeigt die Punkte auf der Karte