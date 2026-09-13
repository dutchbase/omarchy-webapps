# Web Apps

A launcher for your web apps, living in the Omarchy bar.

Click the globe (or press a key) and a panel opens in the middle of the screen
with every web app you have installed. Type to filter, press enter to open one.
The panel closes behind you.

There's a gear in the corner for choosing which apps show up. Everything shows
by default; switch off the ones you don't want and the choice is saved right
away. The panel grows to fit your list, so twenty apps is a list you read, not
a box you scroll.

## Install

```bash
omarchy plugin add https://github.com/dutchbase/omarchy-webapps.git --enable
omarchy bar put dutchbase.webapps --section right
```

Then add a keybinding in `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + SHIFT_R", "Web apps", "omarchy-shell shell toggle dutchbase.webapps")
```

One warning about that binding: it's the right shift key itself. Holding Super
and tapping right shift fires the launcher, so it also fires on the way into any
`SUPER + SHIFT + <key>` shortcut. If that trips you up, use
`SUPER + CTRL + SHIFT + W` instead (it's free).

## Using it

- Click the globe in the bar, or hit the hotkey. The panel opens centered.
- Type to narrow the list, or use the arrow keys.
- `↵` opens the highlighted app and closes the panel.
- `esc` clears your search first, then closes the panel on the next press.
- The gear (or `Tab`) switches to the picker: every web app with an on/off
  switch, plus "Show all" and "Hide all". Changes save as you make them.

## What counts as a web app

Any desktop entry Omarchy launches as a web app (`omarchy-launch-webapp`,
`omarchy-webapp-handler-*`), plus browser-installed PWAs (`--app-id=` and
`--app=` on Chromium, Chrome, Brave, Edge, Vivaldi, Opera, and Helium).
Ordinary native apps don't show up.

## Where the setting lives

The picker writes a `hiddenApps` list to the widget's entry in
`~/.config/omarchy/shell.json`. You never have to edit it by hand.

## Under the hood

Three files do the work:

- `BarWidget.qml` — the bar button and the panel's open/close plumbing.
- `Panel.qml` — the centered overlay: both the list and the picker.
- `WebApps.js` — reading the desktop entries, filtering, and the show/hide logic.

`WebApps.js` deliberately has no QML in it, so it runs on its own:

```bash
node test-webapps.js
```

## Removing it

```bash
omarchy plugin remove dutchbase.webapps
```

## License

MIT
