"""MiHome API - local web dashboard + REST API for Xiaomi MIoT devices.

Run:  python app.py [port]   ->  opens http://127.0.0.1:8000 (Swagger: /docs)
"""
import json
import os
import socket
import sys
import threading
import time
import webbrowser
from typing import Any, Optional

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import miot_spec
from paths import DATA_DIR, STATIC_DIR
from xiaomi_cloud import SERVERS, CloudError, XiaomiCloud

try:
    from miio import Device as MiioDevice  # python-miio, LAN control
except Exception:  # pragma: no cover
    MiioDevice = None

__version__ = "1.0.0"
APP_ID = "mihome-api"
DEVICES_FILE = DATA_DIR / "devices.json"
VIA = Query("auto", enum=["auto", "lan", "cloud"], description="auto = LAN first, fall back to cloud")

cloud = XiaomiCloud()
app = FastAPI(title="MiHome API", version=__version__,
              description="Control Xiaomi MIoT devices over LAN or Xiaomi Cloud. "
                          "Errors are returned as `{error: <code>, message: <text>}`.")


def fail(status, code, message, **extra):
    raise CloudError(code, message, {"status": status, **extra})


@app.exception_handler(CloudError)
def _cloud_error(_, exc: CloudError):
    extra = {k: v for k, v in exc.extra.items() if k != "status"}
    return JSONResponse(status_code=exc.extra.get("status", 400),
                        content={"error": exc.code, "message": str(exc), **extra})


# ---------------- helpers ----------------
def load_devices():
    if DEVICES_FILE.exists():
        return json.loads(DEVICES_FILE.read_text("utf-8"))
    return []


def save_devices(devs):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DEVICES_FILE.write_text(json.dumps(devs, indent=2, ensure_ascii=False), "utf-8")


def get_device(did):
    for d in load_devices():
        if d["did"] == did:
            return d
    fail(404, "device_not_found", f"Device {did} not found. Call GET /api/devices?refresh=true")


def spec_of(dev):
    spec = miot_spec.get_spec(dev["model"])
    if not spec:
        fail(404, "no_spec", f"No MIoT spec for model {dev['model']}")
    return spec


def lan(dev):
    if MiioDevice is None or not dev.get("localip") or not dev.get("token"):
        return None
    return MiioDevice(dev["localip"], dev["token"], timeout=3)


def call(dev, via, lan_method, lan_params, cloud_fn):
    """Run over LAN or cloud. via=auto: try LAN first, fall back to cloud."""
    if via in ("auto", "lan"):
        d = lan(dev)
        err = "python-miio not installed or device has no IP/token"
        if d is not None:
            try:
                return "lan", d.send(lan_method, lan_params)
            except Exception as e:
                err = str(e)
        if via == "lan":
            fail(502, "lan_failed", err)
    return "cloud", cloud_fn()


def coerce(prop, value):
    fmt = (prop or {}).get("format") or ""
    if fmt == "bool" and isinstance(value, str):
        return value.lower() in ("1", "true", "on")
    if fmt.startswith(("int", "uint")):
        return int(value)
    if fmt == "float":
        return float(value)
    return value


# ---------------- models ----------------
class LoginBody(BaseModel):
    username: str
    password: str
    server: str = "auto"
    captcha: Optional[str] = None


class PropItem(BaseModel):
    key: Optional[str] = None  # e.g. "air-purifier.mode"
    siid: Optional[int] = None
    piid: Optional[int] = None
    value: Any


class SetPropsBody(BaseModel):
    props: list[PropItem]


class ActionBody(BaseModel):
    key: Optional[str] = None  # e.g. "filter.reset-filter-life"
    siid: Optional[int] = None
    aiid: Optional[int] = None
    params: list[Any] = []


class RawBody(BaseModel):
    method: str  # e.g. "get_properties", "miIO.info"
    params: Any = []


# ---------------- auth ----------------
@app.post("/api/login", tags=["auth"], summary="Log in to Xiaomi Cloud (once)")
def login(body: LoginBody):
    if body.server != "auto" and body.server not in SERVERS:
        fail(400, "bad_server", f"server must be 'auto' or one of {SERVERS}")
    s = cloud.login(body.username, body.password, "sg" if body.server == "auto" else body.server, body.captcha)
    if body.server == "auto":
        # serviceToken works for every region: pick the first region that has devices
        for srv in ["sg", "cn", "de", "us", "in", "ru", "tw", "i2"]:
            try:
                if cloud.devices(srv):
                    s["server"] = srv
                    cloud.save()
                    break
            except Exception:
                continue
    devs = refresh_devices()
    return {"ok": True, "userId": s["userId"], "server": s["server"], "devices": len(devs)}


@app.get("/api/login/captcha", tags=["auth"], summary="Captcha image when login asks for one")
def captcha():
    img, ctype = cloud.captcha_image()
    return Response(img, media_type=ctype, headers={"Cache-Control": "no-store"})


@app.get("/api/session", tags=["auth"], summary="Login status")
def session():
    info = {"app": APP_ID, "version": __version__, "lan": MiioDevice is not None, "logged_in": cloud.logged_in}
    if cloud.logged_in:
        s = cloud.session
        info.update(username=s["username"], userId=s["userId"], server=s["server"], loginAt=s["loginAt"])
    return info


@app.post("/api/logout", tags=["auth"], summary="Delete the saved session")
def logout():
    cloud.logout()
    return {"ok": True}


# ---------------- devices ----------------
def refresh_devices():
    devs = [{
        "did": d["did"], "name": d.get("name"), "model": d.get("model"), "token": d.get("token"),
        "localip": d.get("localip"), "mac": d.get("mac"), "isOnline": d.get("isOnline"),
        "rssi": d.get("rssi"),
    } for d in cloud.devices()]
    save_devices(devs)
    return devs


@app.get("/api/devices", tags=["devices"], summary="List devices (with IP and token)")
def devices(refresh: bool = False):
    devs = load_devices()
    if refresh or not devs:
        devs = refresh_devices()
    return devs


@app.get("/api/devices/{did}", tags=["devices"], summary="One device")
def device(did: str):
    return get_device(did)


@app.get("/api/devices/{did}/spec", tags=["devices"], summary="MIoT spec: properties and actions")
def device_spec(did: str):
    return spec_of(get_device(did))


@app.get("/api/devices/{did}/status", tags=["control"], summary="Read every readable property")
def status(did: str, via: str = VIA):
    dev = get_device(did)
    spec = spec_of(dev)
    props = [p for s in spec["services"] for p in s["properties"] if "read" in p["access"]]
    results, used = [], None
    for i in range(0, len(props), 15):  # small batches, some devices reject big requests
        chunk = props[i:i + 15]
        used, res = call(dev, via, "get_properties",
                         [{"did": did, "siid": p["siid"], "piid": p["piid"]} for p in chunk],
                         lambda c=chunk: cloud.get_props(did, [(p["siid"], p["piid"]) for p in c]))
        results += res or []
    by = {(r.get("siid"), r.get("piid")): r for r in results}
    out = {}
    for p in props:
        r = by.get((p["siid"], p["piid"]), {})
        out[p["key"]] = {"siid": p["siid"], "piid": p["piid"], "value": r.get("value"),
                         "code": r.get("code"), "unit": p["unit"], "description": p["description"]}
    return {"did": did, "via": used, "time": int(time.time()), "props": out}


@app.get("/api/devices/{did}/prop/{key}", tags=["control"], summary="Read one property by key")
def get_prop(did: str, key: str, via: str = VIA):
    dev = get_device(did)
    p = miot_spec.find_prop(spec_of(dev), key=key)
    if not p:
        fail(404, "no_property", f"Unknown property {key}")
    used, res = call(dev, via, "get_properties", [{"did": did, "siid": p["siid"], "piid": p["piid"]}],
                     lambda: cloud.get_props(did, [(p["siid"], p["piid"])]))
    return {"via": used, "key": key, "value": (res or [{}])[0].get("value"), "raw": res}


@app.post("/api/devices/{did}/props", tags=["control"], summary="Write one or more properties")
def set_props(did: str, body: SetPropsBody, via: str = VIA):
    dev = get_device(did)
    spec = spec_of(dev)
    items = []
    for it in body.props:
        p = miot_spec.find_prop(spec, key=it.key, siid=it.siid, piid=it.piid)
        if it.key and not p:
            fail(404, "no_property", f"Unknown property {it.key}")
        siid, piid = (p["siid"], p["piid"]) if p else (it.siid, it.piid)
        items.append((siid, piid, coerce(p, it.value)))
    used, res = call(dev, via, "set_properties",
                     [{"did": did, "siid": s, "piid": pi, "value": v} for s, pi, v in items],
                     lambda: cloud.set_props(did, items))
    return {"via": used, "result": res}


@app.post("/api/devices/{did}/action", tags=["control"], summary="Run an action (e.g. reset filter)")
def do_action(did: str, body: ActionBody, via: str = VIA):
    dev = get_device(did)
    a = miot_spec.find_action(spec_of(dev), key=body.key, siid=body.siid, aiid=body.aiid)
    if body.key and not a:
        fail(404, "no_action", f"Unknown action {body.key}")
    siid, aiid = (a["siid"], a["aiid"]) if a else (body.siid, body.aiid)
    used, res = call(dev, via, "action", {"did": did, "siid": siid, "aiid": aiid, "in": body.params},
                     lambda: cloud.action(did, siid, aiid, body.params))
    return {"via": used, "result": res}


@app.post("/api/devices/{did}/raw", tags=["control"], summary="Send a raw miIO command over LAN")
def raw(did: str, body: RawBody):
    d = lan(get_device(did))
    if d is None:
        fail(400, "lan_unavailable", "python-miio and device IP/token are required for LAN commands")
    try:
        return {"via": "lan", "result": d.send(body.method, body.params)}
    except Exception as e:
        fail(502, "lan_failed", str(e))


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# ---------------- launcher ----------------
def _already_running(port):
    """True if another MiHome API instance already serves this port."""
    try:
        import requests
        return requests.get(f"http://127.0.0.1:{port}/api/session", timeout=1).json().get("app") == APP_ID
    except Exception:
        return False


def _port_free(port):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def main():
    import uvicorn

    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8000))
    url = f"http://127.0.0.1:{port}"
    if _already_running(port):
        print(f"MiHome API is already running -> {url}")
        webbrowser.open(url)
        return
    while not _port_free(port):
        port += 1
    url = f"http://127.0.0.1:{port}"

    print(f"\n  MiHome API v{__version__}\n  Web UI : {url}\n  Swagger: {url}/docs\n"
          f"  Data   : {DATA_DIR}\n  Close this window to stop.\n")
    if not os.environ.get("MIHOME_NO_BROWSER"):
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
