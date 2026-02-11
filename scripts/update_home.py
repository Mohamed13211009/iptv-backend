import os, json, time
from urllib.parse import urlencode
import urllib.request

BASE_URL = os.getenv("XTREAM_BASE_URL", "").rstrip("/")
USERNAME = os.getenv("XTREAM_USERNAME", "")
PASSWORD = os.getenv("XTREAM_PASSWORD", "")

def fetch_json(action: str):
    q = {
        "username": USERNAME,
        "password": PASSWORD,
        "action": action
    }
    url = f"{BASE_URL}/player_api.php?{urlencode(q)}"
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode("utf-8", errors="ignore"))

def main():
    if not BASE_URL or not USERNAME or not PASSWORD:
        raise SystemExit("Missing XTREAM_BASE_URL / XTREAM_USERNAME / XTREAM_PASSWORD")

    # أقل حاجة مفيدة للهوم (ممكن نزودها بعدين)
    series_cats = fetch_json("get_series_categories")
    vod_cats = fetch_json("get_vod_categories")

    out = {
        "updated_at": int(time.time()),
        "base_url": BASE_URL,
        "series_categories": series_cats if isinstance(series_cats, list) else [],
        "vod_categories": vod_cats if isinstance(vod_cats, list) else []
    }

    os.makedirs("public", exist_ok=True)
    with open("public/home.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)

if __name__ == "__main__":
    main()
