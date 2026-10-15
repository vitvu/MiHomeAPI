<div align="center">

<img src="assets/icon.png" width="80" alt="logo">

# MiHome API

Local web dashboard + REST API for Xiaomi Mi Home (MIoT) devices.<br>
Sign in once, control everything from your browser or scripts.

[![Download](https://img.shields.io/github/v/release/vitvu/MiHomeAPI?label=download&color=ff6a00)](https://github.com/vitvu/MiHomeAPI/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Donate](https://img.shields.io/badge/donate-PayPal-0070ba?logo=paypal)](https://paypal.me/vudinhviet)

<img src="docs/dashboard-en.png" alt="Dashboard" width="860">

</div>

## Features

- **Sign in once.** Captcha and 2-step verification are supported. Your password is never stored.
- **Works with any MIoT device.** Controls are built from the device's spec, with advanced settings hidden until you need them.
- **LAN first, cloud fallback.** Fast local control when the device is reachable, Xiaomi Cloud otherwise.
- **Live, animated device view.** The fan spins at the real motor speed.
- **REST API.** Ready-made `curl` examples in the UI, plus Swagger at `/docs`.
- **English and Vietnamese, light/dark theme, works on phones.**

## Getting started

**Windows:** download [`MiHomeAPI.exe`](https://github.com/vitvu/MiHomeAPI/releases/latest) and double-click it. Your browser opens at `http://127.0.0.1:8000`.

**From source (Python 3.10+):**

```bash
git clone https://github.com/vitvu/MiHomeAPI.git && cd MiHomeAPI
pip install -r requirements.txt
python app.py
```

> If `python-miio` fails to build on Windows, run `pip install netifaces-plus` first, then `pip install python-miio --no-deps`. Without it, control still works through the cloud.

## API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/login` | Sign in `{username, password, server: "auto"}` |
| `GET` | `/api/devices` | List devices (IP, token, online) |
| `GET` | `/api/devices/{did}/status` | Read all properties |
| `GET` | `/api/devices/{did}/prop/{key}` | Read one property |
| `POST` | `/api/devices/{did}/props` | Write properties |
| `POST` | `/api/devices/{did}/action` | Run an action |

```bash
curl -X POST http://127.0.0.1:8000/api/devices/<did>/props \
  -H "Content-Type: application/json" \
  -d '{"props":[{"key":"air-purifier.mode","value":3},{"key":"air-purifier.fan-level","value":2}]}'
```

Add `?via=lan` or `?via=cloud` to force a connection. The full list of endpoints and property keys is in the **API** tab of the dashboard.

## Notes

- The server only listens on `127.0.0.1`. Don't expose it to the internet.
- The `data/` folder holds your session and device tokens. Keep it private.
- If SmartScreen warns about the exe, click **More info → Run anyway**.
- Tested with the Xiaomi Smart Air Purifier 4 Pro (`zhimi.airp.vb4`). If a device doesn't display correctly, please [open an issue](https://github.com/vitvu/MiHomeAPI/issues).

## Credits

[python-miio](https://github.com/rytilahti/python-miio) · [Xiaomi-cloud-tokens-extractor](https://github.com/PiotrMachowski/Xiaomi-cloud-tokens-extractor) · [miot-spec.org](https://home.miot-spec.com)

Unofficial project, not affiliated with Xiaomi.

## Support

If this tool helps you, you can support the project with a donation ☕

[![Donate with PayPal](https://img.shields.io/badge/PayPal-Donate-0070ba?style=for-the-badge&logo=paypal)](https://paypal.me/vudinhviet)

## License

[MIT](LICENSE)
