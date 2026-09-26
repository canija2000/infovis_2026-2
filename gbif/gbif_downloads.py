"""GBIF bulk download manager for Atlas de aves de Chile (ruta A via GBIF).

Auth: HTTP Basic with GBIF username/password. Credentials are NEVER stored
here or on disk: pass them via env vars GBIF_USER / GBIF_PWD (transient).

State file: gbif/state.json (download keys + statuses, no secrets).
"""
import json
import os
import sys
import urllib.request
import urllib.error

API = "https://api.gbif.org/v1"
STATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "state.json")

TAXON_KEY = "212"  # Aves
COUNTRY = "CL"
START_DATE = "2016-09-17"
END_DATE = "2026-09-25"
YEARS = list(range(2016, 2027))


def _auth():
    user = os.environ.get("GBIF_USER")
    pwd = os.environ.get("GBIF_PWD")
    if not user or not pwd:
        raise SystemExit("Set GBIF_USER and GBIF_PWD env vars (transient, not stored).")
    return user, pwd


def _req(method, path, body=None):
    import base64
    headers = {"Content-Type": "application/json"}
    user = os.environ.get("GBIF_USER")
    pwd = os.environ.get("GBIF_PWD")
    if user and pwd:
        token = base64.b64encode(f"{user}:{pwd}".encode()).decode()
        headers["Authorization"] = f"Basic {token}"
    elif body is not None:
        # solo el POST (submit) exige credenciales; los GET son públicos
        raise SystemExit("Set GBIF_USER and GBIF_PWD env vars (transient, not stored).")
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            raw = resp.read().decode().strip()
            if not raw:
                return None
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return raw  # ej. la key de descarga viene como texto plano
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()[:300]}", file=sys.stderr)
        raise


def predicate_for_year(year):
    return {
        "type": "and",
        "predicates": [
            {"type": "equals", "key": "TAXON_KEY", "value": TAXON_KEY},
            {"type": "equals", "key": "COUNTRY", "value": COUNTRY},
            {"type": "equals", "key": "HAS_COORDINATE", "value": "true"},
            {"type": "equals", "key": "HAS_GEOSPATIAL_ISSUE", "value": "false"},
            {"type": "equals", "key": "YEAR", "value": str(year)},
            {"type": "greaterThanOrEquals", "key": "EVENT_DATE", "value": START_DATE},
            {"type": "lessThanOrEquals", "key": "EVENT_DATE", "value": END_DATE},
        ],
    }


def submit(year, email):
    user, _ = _auth()
    body = {
        "creator": user,
        "notificationAddresses": [email],
        "sendNotification": True,
        "format": "SIMPLE_CSV",
        "predicate": predicate_for_year(year),
    }
    key = _req("POST", "/occurrence/download/request", body)
    print(f"submitted year={year} key={key}")
    st = load_state()
    st.setdefault("downloads", {})[str(year)] = {"key": key, "status": "SUBMITTED"}
    save_state(st)
    return key


def status(key):
    return _req("GET", f"/occurrence/download/{key}")


def load_state():
    if os.path.exists(STATE):
        return json.load(open(STATE))
    return {"downloads": {}}


def save_state(st):
    tmp = STATE + ".tmp"
    json.dump(st, open(tmp, "w"), indent=1)
    os.replace(tmp, STATE)


def refresh_all():
    st = load_state()
    for year, info in sorted(st.get("downloads", {}).items()):
        d = status(info["key"])
        info["status"] = d.get("status")
        info["totalRecords"] = d.get("totalRecords")
        info["size"] = d.get("size")
        info["doi"] = d.get("doi")
        print(f"{year}: {info['status']} records={info.get('totalRecords')} "
              f"size={info.get('size')}")
    save_state(st)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "submit":
        submit(int(sys.argv[2]), sys.argv[3])
    elif cmd == "status":
        if len(sys.argv) > 2:
            d = status(sys.argv[2])
            print(json.dumps({k: d.get(k) for k in
                              ["key", "status", "size", "totalRecords", "created"]}, indent=1))
        else:
            refresh_all()
