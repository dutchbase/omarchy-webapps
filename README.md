# Web Apps — Omarchy plugin

A native web app launcher for the [Omarchy](https://omarchy.org/) bar: one
themed button, one keyboard-summoned panel, and an in-panel picker for which
web apps to show.

![kind](https://img.shields.io/badge/kind-bar--widget-blue)

## Install

```bash
omarchy plugin add https://github.com/dutchbase/omarchy-webapps.git --enable
omarchy bar put dutchbase.webapps --section right
```

Then bind it. In `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + SHIFT_R", "Web apps", "omarchy-shell shell toggle dutchbase.webapps")
```

`SUPER + SHIFT_R` binds the right shift key itself. Pressing it while Super is
held fires the launcher, so it will also trigger on the way to any
`SUPER + SHIFT + <key>` chord. If that clashes with your setup, pick any free
key — `SUPER + CTRL + SHIFT + W` works well.

## Usage

- Click the globe in the bar, or press the hotkey, to open the panel.
- Type to filter, `↑`/`↓` to move, `↵` to launch, `esc` to close.
- Press the gear (or `Tab`) to choose which web apps appear. "Show all" and
  "Hide all" are one click away; every change is saved immediately.

By default every installed web app is shown. A web app is any desktop entry
launched through `omarchy-launch-webapp` / `omarchy-webapp-handler`, or a
browser PWA (`--app-id=` / `--app=` on a Chromium-family browser).

## Configure

The panel is the configuration UI; no manual file editing is required. The
selection is stored under the widget's entry in `~/.config/omarchy/shell.json`
as `hiddenApps`, the ids the user has chosen to hide.

## How it works

- `BarWidget.qml` — the bar cell, the panel loader, and the IPC lifecycle
  (`open` / `close` / `toggle`).
- `Panel.qml` — a `KeyboardPanel` with two modes: the launcher and the picker.
- `WebApps.js` — pure detection, filtering, and settings logic. It has no
  QML dependencies, so it is unit-tested directly with Node.

Run the tests:

```bash
node test-webapps.js
```

## Remove

```bash
omarchy plugin remove dutchbase.webapps
```

## License

MIT
