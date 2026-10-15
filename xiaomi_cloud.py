"""Xiaomi Cloud client: account login + signed MIoT API calls.

Login flow based on PiotrMachowski/Xiaomi-cloud-tokens-extractor.
The session (serviceToken, ssecurity, userId) is persisted to data/session.json
so you only need to log in once. The password is never stored.
"""
import base64
import hashlib
import hmac
import json
import os
import random
import string
import time

import requests

from paths import DATA_DIR

SESSION_FILE = DATA_DIR / "session.json"
SERVERS = ["cn", "de", "us", "ru", "tw", "sg", "in", "i2"]


class CloudError(Exception):
    """Error with a machine-readable `code` the UI can translate."""

    def __init__(self, code, message, extra=None):
        super().__init__(message)
        self.code = code
        self.extra = extra or {}


def _parse(text):
    return json.loads(text.replace("&&&START&&&", ""))


class XiaomiCloud:
    def __init__(self):
        self.session = None
        self.pending = None  # login waiting for a captcha
        self.load()

    # ---------- session persistence ----------
    def load(self):
        if SESSION_FILE.exists():
            try:
                self.session = json.loads(SESSION_FILE.read_text("utf-8"))
            except Exception:
                self.session = None

    def save(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        SESSION_FILE.write_text(json.dumps(self.session, indent=2), "utf-8")

    def logout(self):
        self.session = None
        if SESSION_FILE.exists():
            SESSION_FILE.unlink()

    @property
    def logged_in(self):
        return bool(self.session and self.session.get("serviceToken"))

    # ---------- login ----------
    def captcha_image(self):
        if not self.pending or not self.pending.get("captchaUrl"):
            raise CloudError("no_captcha", "No captcha pending")
        r = self.pending["s"].get(self.pending["captchaUrl"], timeout=15)
        return r.content, r.headers.get("Content-Type", "image/jpeg")

    def login(self, username, password, server="sg", captcha=None):
        p = self.pending
        if captcha and p and p["username"] == username:
            return self._auth(p["s"], p["agent"], p["deviceId"], p["sign"], username, password, server, captcha)

        agent_id = "".join(random.choice("ABCDEF") for _ in range(13))
        agent = f"Android-7.1.1-1.0.0-ONEPLUS A3010-136-{agent_id} APP/xiaomi.smarthome APPV/62830"
        device_id = "".join(random.choice(string.ascii_lowercase) for _ in range(6))
        s = requests.Session()
        s.headers["User-Agent"] = agent
        s.cookies.update({"sdkVersion": "accountsdk-18.8.15", "deviceId": device_id})
        r1 = s.get("https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true",
                   cookies={"userId": username}, timeout=15)
        sign = _parse(r1.text).get("_sign", "")
        return self._auth(s, agent, device_id, sign, username, password, server, None)

    def _auth(self, s, agent, device_id, sign, username, password, server, captcha):
        r2 = s.post("https://account.xiaomi.com/pass/serviceLoginAuth2", data={
            "sid": "xiaomiio",
            "hash": hashlib.md5(password.encode()).hexdigest().upper(),
            "callback": "https://sts.api.io.mi.com/sts",
            "qs": "%3Fsid%3Dxiaomiio%26_json%3Dtrue",
            "user": username,
            "_sign": sign,
            "_json": "true",
            **({"captCode": captcha} if captcha else {}),
        }, timeout=15)
        j = _parse(r2.text)
        if j.get("captchaUrl"):
            self.pending = {"s": s, "agent": agent, "deviceId": device_id, "username": username,
                            "sign": sign, "captchaUrl": "https://account.xiaomi.com" + j["captchaUrl"]}
            raise CloudError("captcha_wrong" if captcha else "captcha_required",
                             "Captcha required", {"captcha": True})
        if j.get("notificationUrl"):
            raise CloudError("2fa_required", "Two-factor verification required",
                             {"notificationUrl": j["notificationUrl"]})
        if not j.get("ssecurity") or not j.get("location"):
            raise CloudError("bad_credentials", j.get("desc") or "Wrong account or password")

        self.pending = None
        r3 = s.get(j["location"], timeout=15)
        token = r3.cookies.get("serviceToken") or s.cookies.get("serviceToken")
        if not token:
            raise CloudError("no_service_token", "Could not obtain serviceToken")

        self.session = {
            "username": username,
            "userId": str(j["userId"]),
            "ssecurity": j["ssecurity"],
            "serviceToken": token,
            "server": server,
            "agent": agent,
            "deviceId": device_id,
            "loginAt": int(time.time()),
        }
        self.save()
        return self.session

    # ---------- signed request ----------
    def _url(self, server=None):
        server = server or self.session["server"]
        return "https://" + ("" if server == "cn" else server + ".") + "api.io.mi.com/app"

    @staticmethod
    def _nonce():
        millis = int(time.time() * 1000)
        return base64.b64encode(os.urandom(8) + (millis // 60000).to_bytes(4, "big")).decode()

    def _signed_nonce(self, nonce):
        h = hashlib.sha256(base64.b64decode(self.session["ssecurity"]) + base64.b64decode(nonce))
        return base64.b64encode(h.digest()).decode()

    def request(self, path, data, server=None):
        if not self.logged_in:
            raise CloudError("not_logged_in", "Not logged in", {"status": 401})
        data_str = json.dumps(data, separators=(",", ":"))
        nonce = self._nonce()
        snonce = self._signed_nonce(nonce)
        msg = "&".join([path, snonce, nonce, "data=" + data_str])
        signature = base64.b64encode(
            hmac.new(base64.b64decode(snonce), msg.encode(), hashlib.sha256).digest()).decode()
        r = requests.post(self._url(server) + path, headers={
            "User-Agent": self.session["agent"],
            "Accept-Encoding": "identity",
            "x-xiaomi-protocal-flag-cli": "PROTOCAL-HTTP2",
            "Content-Type": "application/x-www-form-urlencoded",
        }, cookies={
            "userId": self.session["userId"],
            "yetAnotherServiceToken": self.session["serviceToken"],
            "serviceToken": self.session["serviceToken"],
            "locale": "en_GB",
            "timezone": "GMT+07:00",
            "is_daylight": "0",
            "dst_offset": "0",
            "channel": "MI_APP_STORE",
        }, data={"signature": signature, "_nonce": nonce, "data": data_str}, timeout=15)
        if r.status_code == 401:
            raise CloudError("session_expired", "Session expired, please log in again", {"status": 401})
        r.raise_for_status()
        j = r.json()
        if j.get("code", 0) != 0:
            raise CloudError("cloud_error", j.get("message") or "Cloud error", {"response": j})
        return j.get("result")

    # ---------- high level ----------
    def devices(self, server=None):
        res = self.request("/home/device_list", {
            "getVirtualModel": True, "getHuamiDevices": 1,
            "get_split_device": False, "support_smart_home": True}, server)
        return (res or {}).get("list") or []

    def get_props(self, did, props):
        return self.request("/miotspec/prop/get",
                            {"params": [{"did": did, "siid": s, "piid": p} for s, p in props]})

    def set_props(self, did, items):
        return self.request("/miotspec/prop/set",
                            {"params": [{"did": did, "siid": s, "piid": p, "value": v} for s, p, v in items]})

    def action(self, did, siid, aiid, ins):
        return self.request("/miotspec/action",
                            {"params": {"did": did, "siid": siid, "aiid": aiid, "in": ins}})
