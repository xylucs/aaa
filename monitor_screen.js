import subprocess
import time
import os
import requests
import re
from datetime import datetime

# Telegram Config
TELEGRAM_BOT_TOKEN = '7421616304:AAHAxPtNgMQftV7YBPT2N9kOQ4QwZHyiFqQ'
TELEGRAM_CHAT_ID = '5467092744'

# Fungsi kirim notifikasi ke Telegram
def send_telegram(message):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        'chat_id': TELEGRAM_CHAT_ID,
        'text': message,
        'parse_mode': 'Markdown'
    }
    try:
        response = requests.post(url, data=payload)
        if response.status_code != 200:
            print(f"Gagal kirim ke Telegram: {response.text}")
    except Exception as e:
        print(f"Error saat mengirim ke Telegram: {e}")

# Ambil daftar screen session
def get_screen_sessions():
    try:
        result = subprocess.run(["screen", "-ls"], capture_output=True, text=True)
        lines = result.stdout.strip().split('\n')
        screen_names = []
        for line in lines:
            match = re.search(r'^(\d+\.\S+)', line.strip())
            if match:
                screen_names.append(match.group(1))
        return screen_names
    except Exception as e:
        print(f"Gagal ambil daftar screen: {e}")
        return []

# Cek isi log screen
def check_screen_log(screen_name):
    log_file = f"/tmp/{screen_name}_log.txt"
    try:
        subprocess.run(["screen", "-S", screen_name, "-X", "hardcopy", "-h", log_file], check=True)
        with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
        os.remove(log_file)

        last_lines = lines[-15:] if len(lines) > 15 else lines
        joined_log = ''.join(last_lines)
        content_lower = joined_log.lower()

        success_keywords = [
            "success", "done", "completed", "processed", "earning",
            "ping success", "already completed", "skipped", "wait for"
        ]
        error_keywords = ["fail", "error", "cannot", "timeout", "traceback", "invalid"]

        for keyword in error_keywords:
            if keyword in content_lower:
                return False, joined_log.strip()

        for keyword in success_keywords:
            if keyword in content_lower:
                return True, joined_log.strip()

        return False, joined_log.strip()
    except Exception as e:
        print(f"Error saat membaca log dari {screen_name}: {e}")
        return False, f"Error membaca log: {e}"

# Monitoring utama
# ... (bagian lain tidak berubah)

def monitor_screens():
    banner = (
        "=============================================\n"
        "\U0001F4E1  SCREEN MONITORING - AUTONOTIF TELEGRAM\n"
        "\U0001F527  by @LittleBozz | Telegram: @bzrxt\n"
        f"\U0001F552  Interval Cek: 60 detik\n"
        "=============================================\n"
    )

    print(banner + "\n")
    send_telegram(f"```\n{banner}```")

    while True:
        screens = get_screen_sessions()
        if not screens:
            print("\n⚠️ Tidak ada screen aktif.\n")
            send_telegram("⚠️ *Tidak ada screen aktif di VPS saat ini.*")
        else:
            logs = []
            for screen in screens:
                status, detail = check_screen_log(screen)
                detail_cleaned = re.sub(r'[`]', '', detail).strip()  # Bersihkan backtick dan spasi

                if status:
                    log = f"✅ {screen} aman"
                else:
                    if detail_cleaned:
                        log = f"🚨 {screen} error\n```\n{detail_cleaned[-1000:]}\n```"
                    else:
                        log = f"🚨 {screen} error\n(Log kosong)"
                logs.append(log)
                print(log)

            summary = '\n'.join(logs)
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            telegram_message = f"📋 *Laporan Monitoring - {now}*\n\n" + summary
            send_telegram(telegram_message)

        print("\n⏳ Menunggu 60 detik...")
        time.sleep(60)
