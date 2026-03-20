"""
Telegram Bot zum Erfassen von Messpunkten.
Sendet einen Standort -> Bot fragt nach Bezeichnung -> speichert in JSON.
Nur erlaubte User-IDs koennen den Bot nutzen (ALLOWED_USER_IDS).
Erfasst: Lat, Lon, Hoehe, Genauigkeit (horizontal/vertikal).
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# .env Datei laden (liegt neben bot.py)
load_dotenv(Path(__file__).resolve().parent / ".env")

from telegram import Update
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

# --- Konfiguration ---
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "messpunkte.json"

# Erlaubte Telegram User-IDs (kommasepariert in Env-Variable)
_allowed_raw = os.environ.get("ALLOWED_USER_IDS", "")
ALLOWED_USER_IDS: set[int] = set()
if _allowed_raw.strip():
    for uid in _allowed_raw.split(","):
        uid = uid.strip()
        if uid.isdigit():
            ALLOWED_USER_IDS.add(int(uid))

# Conversation-States
WAITING_FOR_NAME = 0
WAITING_FOR_DESCRIPTION = 1


# --- Hilfsfunktionen ---
def load_data() -> dict:
    if DATA_FILE.exists():
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"messpunkte": []}


def save_data(data: dict) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def is_authorized(update: Update) -> bool:
    """Prueft ob der User berechtigt ist."""
    if not ALLOWED_USER_IDS:
        return True  # Keine Einschraenkung wenn leer
    return update.effective_user and update.effective_user.id in ALLOWED_USER_IDS


# --- Bot-Handler ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update):
        await update.message.reply_text("Zugriff verweigert.")
        return
    user_id = update.effective_user.id
    await update.message.reply_text(
        f"Hallo! Deine User-ID: {user_id}\n\n"
        "Sende mir einen Standort (Live Location fuer beste Genauigkeit) "
        "und ich erfasse ihn als Messpunkt.\n\n"
        "Befehle:\n"
        "/start - Hilfe anzeigen\n"
        "/liste - Alle Messpunkte auflisten\n"
        "/loesche <id> - Messpunkt loeschen\n"
        "/id - Deine Telegram User-ID anzeigen"
    )


async def show_id(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Zeigt die eigene Telegram User-ID an."""
    uid = update.effective_user.id
    await update.message.reply_text(f"Deine Telegram User-ID: {uid}")


async def receive_location(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Standort empfangen mit allen verfuegbaren GPS-Daten."""
    if not is_authorized(update):
        await update.message.reply_text("Zugriff verweigert.")
        return ConversationHandler.END

    location = update.message.location

    # Alle verfuegbaren GPS-Daten extrahieren
    context.user_data["pending_lat"] = location.latitude
    context.user_data["pending_lon"] = location.longitude
    context.user_data["pending_altitude"] = getattr(location, "altitude", None)
    context.user_data["pending_horizontal_accuracy"] = getattr(location, "horizontal_accuracy", None)
    context.user_data["pending_heading"] = getattr(location, "heading", None)
    context.user_data["pending_speed"] = getattr(location, "speed", None)

    # Live-Location hat mehr Daten
    is_live = getattr(location, "live_period", None) is not None

    alt = context.user_data["pending_altitude"]
    acc = context.user_data["pending_horizontal_accuracy"]

    info = f"📍 Standort empfangen{'  (Live)' if is_live else ''}:\n"
    info += f"   Lat: {location.latitude:.8f}\n"
    info += f"   Lon: {location.longitude:.8f}\n"
    if alt is not None:
        info += f"   Hoehe: {alt:.1f} m\n"
    if acc is not None:
        info += f"   Genauigkeit: ±{acc:.1f} m\n"

    info += "\nWie soll dieser Messpunkt heissen? (Bezeichnung eingeben)"

    await update.message.reply_text(info)
    return WAITING_FOR_NAME


async def receive_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Name empfangen, nach Beschreibung fragen."""
    context.user_data["pending_name"] = update.message.text.strip()

    await update.message.reply_text(
        "Beschreibung eingeben (Details, Notizen zum Messpunkt).\n"
        "Oder /skip um ohne Beschreibung zu speichern."
    )
    return WAITING_FOR_DESCRIPTION


async def receive_description(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Beschreibung empfangen und Messpunkt speichern."""
    description = update.message.text.strip()
    return await _save_messpunkt(update, context, description)


async def skip_description(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Ohne Beschreibung speichern."""
    return await _save_messpunkt(update, context, "")


async def _save_messpunkt(update: Update, context: ContextTypes.DEFAULT_TYPE, description: str) -> int:
    """Messpunkt mit allen GPS-Daten speichern."""
    name = context.user_data.pop("pending_name")
    lat = context.user_data.pop("pending_lat")
    lon = context.user_data.pop("pending_lon")
    altitude = context.user_data.pop("pending_altitude", None)
    h_accuracy = context.user_data.pop("pending_horizontal_accuracy", None)
    heading = context.user_data.pop("pending_heading", None)
    speed = context.user_data.pop("pending_speed", None)

    data = load_data()

    existing_ids = [p.get("id", 0) for p in data["messpunkte"]]
    next_id = max(existing_ids, default=0) + 1

    messpunkt = {
        "id": next_id,
        "name": name,
        "description": description,
        "lat": round(lat, 8),
        "lon": round(lon, 8),
        "altitude": round(altitude, 2) if altitude is not None else None,
        "accuracy": round(h_accuracy, 2) if h_accuracy is not None else None,
        "heading": round(heading, 1) if heading is not None else None,
        "speed": round(speed, 2) if speed is not None else None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user": update.effective_user.first_name,
    }

    data["messpunkte"].append(messpunkt)
    save_data(data)

    msg = f"✅ Messpunkt #{next_id} gespeichert!\n"
    msg += f"   Name: {name}\n"
    if description:
        msg += f"   Beschreibung: {description}\n"
    msg += f"   Lat: {lat:.8f}\n"
    msg += f"   Lon: {lon:.8f}\n"
    if altitude is not None:
        msg += f"   Hoehe: {altitude:.1f} m\n"
    if h_accuracy is not None:
        msg += f"   Genauigkeit: ±{h_accuracy:.1f} m\n"

    await update.message.reply_text(msg)
    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    for key in list(context.user_data):
        if key.startswith("pending_"):
            del context.user_data[key]
    await update.message.reply_text("Abgebrochen.")
    return ConversationHandler.END


async def liste(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update):
        await update.message.reply_text("Zugriff verweigert.")
        return

    data = load_data()
    punkte = data.get("messpunkte", [])

    if not punkte:
        await update.message.reply_text("Noch keine Messpunkte erfasst.")
        return

    lines = []
    for p in punkte:
        alt = f"  {p['altitude']:.1f}m" if p.get("altitude") is not None else ""
        acc = f"  ±{p['accuracy']:.1f}m" if p.get("accuracy") is not None else ""
        desc = f"\n   → {p['description']}" if p.get("description") else ""
        lines.append(
            f"#{p['id']} {p['name']} ({p['lat']:.8f}, {p['lon']:.8f}{alt}{acc}){desc}"
        )

    await update.message.reply_text("Messpunkte:\n" + "\n".join(lines))


async def loesche(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_authorized(update):
        await update.message.reply_text("Zugriff verweigert.")
        return

    if not context.args:
        await update.message.reply_text("Bitte ID angeben: /loesche <id>")
        return

    try:
        target_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("Ungueltige ID.")
        return

    data = load_data()
    original_count = len(data["messpunkte"])
    data["messpunkte"] = [p for p in data["messpunkte"] if p.get("id") != target_id]

    if len(data["messpunkte"]) == original_count:
        await update.message.reply_text(f"Messpunkt #{target_id} nicht gefunden.")
        return

    save_data(data)
    await update.message.reply_text(f"Messpunkt #{target_id} geloescht.")


def main() -> None:
    if not TOKEN:
        print("Fehler: TELEGRAM_BOT_TOKEN nicht gesetzt!")
        print("Setze die Umgebungsvariable oder erstelle eine .env-Datei.")
        return

    if ALLOWED_USER_IDS:
        print(f"Erlaubte User-IDs: {ALLOWED_USER_IDS}")
    else:
        print("WARNUNG: Keine ALLOWED_USER_IDS gesetzt – Bot ist fuer alle offen!")

    app = ApplicationBuilder().token(TOKEN).build()

    # Conversation: Location -> Name -> Beschreibung -> Speichern
    conv_handler = ConversationHandler(
        entry_points=[MessageHandler(filters.LOCATION, receive_location)],
        states={
            WAITING_FOR_NAME: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, receive_name),
            ],
            WAITING_FOR_DESCRIPTION: [
                CommandHandler("skip", skip_description),
                MessageHandler(filters.TEXT & ~filters.COMMAND, receive_description),
            ],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("id", show_id))
    app.add_handler(CommandHandler("liste", liste))
    app.add_handler(CommandHandler("loesche", loesche))
    app.add_handler(conv_handler)

    print("Bot gestartet...")
    app.run_polling()


if __name__ == "__main__":
    main()
