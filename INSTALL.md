# Installing Arete Monitor

This guide is for anyone who just wants to **install and run the app** — no
technical background needed. Pick your computer type below and follow the
steps.

All downloads live on the
**[latest release page](https://github.com/project-arete/arete-monitor/releases/latest)**.
The links below point at the current version (v0.2.0); if a newer version
exists, grab the matching file from that page instead.

> ### ⚠️ Before you start: expect a security warning
> These installers are **not signed** with an Apple or Microsoft developer
> certificate yet. That means your computer will show a warning the first time
> you open the app — something like *"cannot verify the developer"* or
> *"Windows protected your PC"*. **This is expected.** Each section below
> shows the extra click needed to proceed. Only ever download the app from
> this project's own releases page.

---

## macOS

**1. Find out which Mac you have.** Click the Apple menu () → **About This
Mac**. If "Chip" says *Apple M1/M2/M3/M4…* you have **Apple Silicon**; if it
says *Intel*, you have an **Intel Mac**.

**2. Download the right file:**

- Apple Silicon: [Arete-Monitor-0.2.0-arm64.dmg](https://github.com/project-arete/arete-monitor/releases/download/v0.2.0/Arete-Monitor-0.2.0-arm64.dmg)
- Intel: [Arete-Monitor-0.2.0-x64.dmg](https://github.com/project-arete/arete-monitor/releases/download/v0.2.0/Arete-Monitor-0.2.0-x64.dmg)

**3. Install.** Open the downloaded `.dmg` and drag **Arete Monitor** onto the
**Applications** folder shown next to it.

**4. First launch (the unsigned-app step).** Don't double-click the first
time. Instead, open your **Applications** folder, **right-click (or
Control-click) Arete Monitor → Open**, then click **Open** in the dialog.

> On newer versions of macOS the dialog may only offer "Done". If so: open
> **System Settings → Privacy & Security**, scroll down to the message about
> Arete Monitor, and click **Open Anyway**. You only have to do this once —
> afterwards it opens like any other app.

---

## Windows

**1. Download the installer:**
[Arete-Monitor-Setup-0.2.0.exe](https://github.com/project-arete/arete-monitor/releases/download/v0.2.0/Arete-Monitor-Setup-0.2.0.exe)
— this one works on both regular (Intel/AMD) and ARM Windows machines.

**2. Run it.** Windows will likely show a blue **"Windows protected your
PC"** SmartScreen box (that's the unsigned-app warning). Click **More info**,
then **Run anyway**.

**3. Done.** The app installs itself and creates a Start-menu shortcut named
**Arete Monitor**.

---

## Linux

**Option A — AppImage (works on most distributions):**

1. Download the file for your machine:
   - Regular PC (x86_64): [Arete-Monitor-0.2.0-x86_64.AppImage](https://github.com/project-arete/arete-monitor/releases/download/v0.2.0/Arete-Monitor-0.2.0-x86_64.AppImage)
   - ARM (e.g. Raspberry Pi 5 with a 64-bit desktop): [Arete-Monitor-0.2.0-arm64.AppImage](https://github.com/project-arete/arete-monitor/releases/download/v0.2.0/Arete-Monitor-0.2.0-arm64.AppImage)
2. Make it runnable: right-click the file → **Properties → Permissions →
   allow executing as a program** (or in a terminal: `chmod +x Arete-Monitor-*.AppImage`).
3. Double-click it to run. No installation needed — the file *is* the app.

**Option B — Debian/Ubuntu package (.deb):**

1. Download: [amd64 (regular PC)](https://github.com/project-arete/arete-monitor/releases/download/v0.2.0/Arete-Monitor-0.2.0-amd64.deb)
   or [arm64](https://github.com/project-arete/arete-monitor/releases/download/v0.2.0/Arete-Monitor-0.2.0-arm64.deb)
2. Double-click it to open your software installer, or in a terminal:
   `sudo apt install ./Arete-Monitor-0.2.0-amd64.deb`
3. Launch **Arete Monitor** from your applications menu.

---

## After installing

Open the app, go to the **Config** tab, and enter the realm address and
credentials your realm administrator gave you — then click **Connect**. You
can tick *Remember password* and *Connect automatically on launch* so it's
zero-click from then on.

**Updating:** just download and install a newer version from the
[releases page](https://github.com/project-arete/arete-monitor/releases/latest)
over the old one — your settings are kept.
