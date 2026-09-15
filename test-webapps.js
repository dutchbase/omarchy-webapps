#!/usr/bin/env node
// WebApps.js test harness: fixed fixtures for every rule, then a live scan over
// the desktop entries actually installed on this machine.
//   node test-webapps.js

var W = require("./WebApps.js")
var fs = require("fs")
var os = require("os")
var path = require("path")

var pass = 0, fail = 0
var failures = []
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS  " + name) }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log("  FAIL  " + name + (detail ? " — " + detail : "")) }
}
function section(t) { console.log("\n" + t) }
function entry(over) {
  var base = { id: "App", name: "App", icon: "app", execString: "omarchy-launch-webapp https://app", noDisplay: false, comment: "" }
  for (var k in over) base[k] = over[k]
  return base
}

section("Detection")
check("omarchy-launch-webapp detected", W.isWebAppExec("omarchy-launch-webapp https://youtube.com/"))
check("omarchy-webapp-handler detected", W.isWebAppExec("omarchy-webapp-handler-zoom foo"))
check("chromium --app-id detected", W.isWebAppExec("/usr/bin/chromium --profile-directory=Default --app-id=abc"))
check("inline --app= detected", W.isWebAppExec("chromium --app=https://example.com"))
check("plain app not detected", !W.isWebAppExec("foot"))
check("empty not detected", !W.isWebAppExec(""))
check("--app-identity is not --app=", !W.isWebAppExec("chromium --app-identity"))
check("xdg-terminal-exec --app-id is not a web app", !W.isWebAppExec("xdg-terminal-exec --app-id=TUI.float -e bash -c \"dua i /\""))
check("non-browser --app-id is not a web app", !W.isWebAppExec("myapp --app-id=123"))
check("brave --app-id detected", W.isWebAppExec("brave-browser --profile-directory=Default --app-id=abc"))
check("google-chrome --app detected", W.isWebAppExec("google-chrome --app=https://example.com"))
check("quoted browser executable detected", W.isWebAppExec("\"/opt/Google Chrome/google-chrome-stable\" --app=https://example.com"))
check("chromium-browser detected", W.isWebAppExec("chromium-browser --app-id abc"))
check("separate quoted --app value detected", W.isWebAppExec("vivaldi-stable --app \"https://example.com\""))
check("escaped app flag detected", W.isWebAppExec("brave-browser --app\\=https://example.com"))
check("env-wrapped browser detected", W.isWebAppExec("env FOO=bar microsoft-edge-stable --app-id=abc"))
check("uwsm-wrapped browser detected", W.isWebAppExec("uwsm-app -- chromium --app=https://example.com"))
check("browser name in a non-browser argument is ignored", !W.isWebAppExec("mytool --description=chromium --app-id=123"))
check("browser path in a shell payload is ignored", !W.isWebAppExec("sh -c 'chromium --app=https://example.com'"))
check("launcher substring is ignored", !W.isWebAppExec("not-omarchy-launch-webapp https://example.com"))
check("handler substring is ignored", !W.isWebAppExec("not-omarchy-webapp-handler-zoom %u"))

section("Normalization")
check("normalize returns record", (function () { var r = W.normalizeEntry(entry({})); return r && r.id === "App" && r.name === "App" })())
check("noDisplay filtered", W.normalizeEntry(entry({ noDisplay: true })) === null)
check("non-webapp filtered", W.normalizeEntry(entry({ execString: "foot" })) === null)
check("id-less filtered", W.normalizeEntry(entry({ id: "" })) === null)
check("name falls back to id", W.normalizeEntry(entry({ name: "", id: "Foo" })).name === "Foo")
check("iconless entry is kept", (function () { var r = W.normalizeEntry(entry({ icon: "" })); return r !== null && r.icon === "" })())

section("Collect & sort")
var collected = W.collectWebApps([
  entry({ id: "YouTube", name: "YouTube" }),
  entry({ id: "X", name: "X" }),
  entry({ id: "WhatsApp", name: "WhatsApp" }),
  entry({ id: "YouTube", name: "YouTube duplicate" }),
  entry({ id: "Foot", name: "Foot", execString: "foot" })
])
check("dedupes by id", collected.length === 3, "got " + collected.length)
check("sorts by name case-insensitively", collected.map(function (a) { return a.name }).join(",") === "WhatsApp,X,YouTube")
var iconless = W.collectWebApps([entry({ id: "NoIcon", name: "NoIcon", icon: "" })])
check("collect keeps an iconless entry", iconless.length === 1 && iconless[0].icon === "")
check("iconless entry stays visible", W.visibleWebApps(iconless, [], "").length === 1)
check("iconless entry is toggleable", W.toggleHidden([], "NoIcon").join() === "NoIcon")

section("Filtering")
var apps = collected
check("no hidden shows all", W.visibleWebApps(apps, [], "").length === 3)
check("hidden removes one", W.visibleWebApps(apps, ["X"], "").length === 2)
check("query matches name", W.visibleWebApps(apps, [], "you").map(function (a) { return a.id }).join() === "YouTube")
check("query matches id", W.visibleWebApps(apps, [], "whats").length === 1)
check("query is case-insensitive", W.visibleWebApps(apps, [], "WHATSAPP").length === 1)
check("hidden + query compose", W.visibleWebApps(apps, ["YouTube"], "you").length === 0)
check("visibleCount ignores query", W.visibleCount(apps, ["X"]) === 2)

section("Selection edits")
check("toggle adds", W.toggleHidden([], "X").join() === "X")
check("toggle removes", W.toggleHidden(["X", "Y"], "X").join() === "Y")
check("toggle switches on unseen id", W.toggleHidden(["X"], "Z").join() === "X,Z")
check("toggle empty id is a no-op", W.toggleHidden(["X"], "").join() === "X")
check("hide all returns every id", W.setAllHidden(apps, true).length === 3)
check("show all returns empty", W.setAllHidden(apps, false).length === 0)
check("prune drops stale ids", W.pruneHidden(["X", "Gone"], apps).join() === "X")

section("Shortcut display")
function bind(over) {
  var base = { key: "I", modmask: 64, description: "App" }
  for (var k in over) base[k] = over[k]
  return base
}
check("comboFromBind formats a single modifier", W.comboFromBind(bind({ modmask: 64 })) === "SUPER + I")
check("comboFromBind orders modifiers SUPER/CTRL/ALT/SHIFT", W.comboFromBind(bind({ modmask: 64 + 1 + 4 + 8 })) === "SUPER + CTRL + ALT + SHIFT + I")
check("comboFromBind handles no modifiers", W.comboFromBind(bind({ modmask: 0 })) === "I")
check("comboFromBind uppercases the key", W.comboFromBind(bind({ key: "return", modmask: 64 })) === "SUPER + RETURN")
check("comboFromBind handles a missing bind", W.comboFromBind(null) === "")
check("comboFromBind handles a keyless bind", W.comboFromBind({ modmask: 64 }) === "")

var binds = [
  bind({ key: "K", modmask: 64 + 1, description: "Apple Music" }),
  bind({ key: "RETURN", modmask: 64 + 1, description: "Browser" }),
  bind({ key: "B", modmask: 64 + 1, description: "Browser" })
]
check("shortcutForApp matches by exact description", W.shortcutForApp(binds, "Apple Music") === "SUPER + SHIFT + K")
check("shortcutForApp returns empty for no match", W.shortcutForApp(binds, "Discord") === "")
check("shortcutForApp returns empty for no name", W.shortcutForApp(binds, "") === "")
check("shortcutForApp handles no binds", W.shortcutForApp(null, "Apple Music") === "")
check("shortcutForApp takes the first of duplicate descriptions", W.shortcutForApp(binds, "Browser") === "SUPER + SHIFT + RETURN")

var shortcutApps = [{ id: "am", name: "Apple Music" }, { id: "disc", name: "Discord" }]
check("shortcutsForApps maps only apps with a live bind", (function () {
  var m = W.shortcutsForApps(binds, shortcutApps)
  return m.am === "SUPER + SHIFT + K" && m.disc === undefined
})())
check("shortcutsForApps handles no apps", Object.keys(W.shortcutsForApps(binds, [])).length === 0)

check("shortcutConflicts flags a shared combo", (function () {
  var c = W.shortcutConflicts({ A: "SUPER + I", B: "SUPER + I", C: "SUPER + L" })
  return c.A === true && c.B === true && !c.C
})())
check("shortcutConflicts flags no one when combos differ", Object.keys(W.shortcutConflicts({ A: "SUPER + I", B: "SUPER + L" })).length === 0)
check("shortcutConflicts ignores empty combos", Object.keys(W.shortcutConflicts({ A: "", B: "" })).length === 0)
check("shortcutConflicts handles no input", Object.keys(W.shortcutConflicts()).length === 0)
check("shortcutConflicts handles a three-way collision", (function () {
  var c = W.shortcutConflicts({ A: "SUPER + I", B: "SUPER + I", C: "SUPER + I" })
  return c.A === true && c.B === true && c.C === true
})())

section("Settings merge")
check("merge replaces the patched key", W.mergeSettings({ hiddenApps: ["X"], showSearch: true }, { hiddenApps: ["Y"], id: "ghost" }).hiddenApps.join() === "Y")
check("merge preserves unrelated keys", W.mergeSettings({ hiddenApps: ["X"], showSearch: true }, { hiddenApps: ["Y"] }).showSearch === true)
check("merge keeps id out", W.mergeSettings({ id: "old" }, {}).id === undefined)
check("merge handles null current", W.mergeSettings(null, { hiddenApps: ["X"] }).hiddenApps.join() === "X")

section("Live desktop entries")
var dirs = [path.join(os.homedir(), ".local/share/applications"), "/usr/share/applications"]
var execs = []
dirs.forEach(function (dir) {
  var names
  try { names = fs.readdirSync(dir) } catch (e) { return }
  names.forEach(function (n) {
    if (n.slice(-8) !== ".desktop") return
    var text
    try { text = fs.readFileSync(path.join(dir, n), "utf8") } catch (e) { return }
    var m = text.match(/^Exec=(.*)$/m)
    if (m) execs.push(m[1])
  })
})
if (execs.length === 0) {
  console.log("  SKIP  live entries — no .desktop files readable")
} else {
  var liveHits = execs.filter(W.isWebAppExec)
  console.log("  INFO  detected " + liveHits.length + " web app Exec lines among " + execs.length + " entries")
}

console.log("\n" + "=".repeat(56))
console.log("PASS " + pass + "   FAIL " + fail)
if (fail > 0) { console.log("\nFailures:"); failures.forEach(function (f) { console.log("  - " + f) }) }
console.log("=".repeat(56))
process.exit(fail > 0 ? 1 : 0)
