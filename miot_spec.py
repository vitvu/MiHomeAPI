"""Download & cache MIoT specs (miot-spec.org) to know each model's siid/piid."""
import json
import time

import requests

from paths import DATA_DIR

CACHE = DATA_DIR / "spec_cache"
BASE = "https://miot-spec.org/miot-spec-v2"


def _cached(name, url, max_age):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / name
    if f.exists() and time.time() - f.stat().st_mtime < max_age:
        return json.loads(f.read_text("utf-8"))
    try:
        data = requests.get(url, timeout=30).json()
    except Exception:
        if f.exists():  # offline: fall back to a stale cache
            return json.loads(f.read_text("utf-8"))
        raise
    f.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
    return data


def _short(urn):
    # urn:miot-spec-v2:property:fan-level:00000016:zhimi-mb5:1 -> fan-level
    parts = (urn or "").split(":")
    return parts[3] if len(parts) > 3 else urn


def get_spec(model):
    instances = _cached("instances.json", BASE + "/instances?status=all", 7 * 86400)["instances"]
    cands = [i for i in instances if i["model"] == model]
    if not cands:
        return None
    best = sorted(cands, key=lambda i: (i.get("status") == "released", i.get("version", 0)))[-1]
    raw = _cached(model.replace(".", "_") + ".json", BASE + "/instance?type=" + best["type"], 30 * 86400)
    return simplify(raw)


def simplify(raw):
    services = []
    for s in raw.get("services", []):
        sname = _short(s["type"])
        if sname == "device-information":
            continue
        props = [{
            "siid": s["iid"], "piid": p["iid"],
            "key": f"{sname}.{_short(p['type'])}",
            "name": _short(p["type"]),
            "description": p.get("description", ""),
            "format": p.get("format"),
            "access": p.get("access", []),
            "unit": p.get("unit"),
            "range": p.get("value-range"),
            "values": p.get("value-list"),
        } for p in s.get("properties", [])]
        actions = [{
            "siid": s["iid"], "aiid": a["iid"],
            "key": f"{sname}.{_short(a['type'])}",
            "name": _short(a["type"]),
            "description": a.get("description", ""),
            "in": a.get("in", []),
        } for a in s.get("actions", [])]
        services.append({"siid": s["iid"], "name": sname, "description": s.get("description", ""),
                         "properties": props, "actions": actions})
    return {"type": raw.get("type"), "category": _short(raw.get("type")),
            "description": raw.get("description"), "services": services}


def find_prop(spec, key=None, siid=None, piid=None):
    for s in spec["services"]:
        for p in s["properties"]:
            if (key and p["key"] == key) or (siid == p["siid"] and piid == p["piid"]):
                return p
    return None


def find_action(spec, key=None, siid=None, aiid=None):
    for s in spec["services"]:
        for a in s["actions"]:
            if (key and a["key"] == key) or (siid == a["siid"] and aiid == a["aiid"]):
                return a
    return None
