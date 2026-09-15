// Pure logic for the Web Apps bar widget. No Qt/QML imports, so the module is
// unit-testable with Node (see test-webapps.js) and still importable from QML
// as `import "WebApps.js" as WebApps`.

var browserExecutable = /^(chromium(?:-browser)?|google-chrome(?:-(?:stable|beta|unstable))?|microsoft-edge(?:-(?:stable|beta|dev))?|msedge|brave(?:-browser)?(?:-(?:stable|beta|nightly))?|chrome|vivaldi(?:-(?:stable|snapshot))?|opera(?:-(?:stable|beta|developer))?|helium(?:-browser)?)$/

function execTokens(exec) {
  var out = []
  var token = ""
  var quote = ""
  var escaping = false
  for (var i = 0; i < exec.length; i++) {
    var ch = exec.charAt(i)
    if (escaping) { token += ch; escaping = false; continue }
    if (ch === "\\") { escaping = true; continue }
    if (quote) {
      if (ch === quote) quote = ""
      else token += ch
      continue
    }
    if (ch === "\"" || ch === "'") { quote = ch; continue }
    if (/\s/.test(ch)) {
      if (token) { out.push(token); token = "" }
    } else token += ch
  }
  if (escaping) token += "\\"
  if (token) out.push(token)
  return out
}

function basename(value) {
  var parts = String(value || "").split("/")
  return parts[parts.length - 1].toLowerCase()
}

function commandIndex(tokens) {
  var index = 0
  while (index < tokens.length) {
    var command = basename(tokens[index])
    if (command === "env") {
      index++
      while (index < tokens.length && (tokens[index].charAt(0) === "-" || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index]))) index++
      continue
    }
    if (command === "setsid" || command === "uwsm-app") {
      index++
      while (index < tokens.length && tokens[index].charAt(0) === "-") index++
      continue
    }
    return index
  }
  return -1
}

function isWebAppExec(execString) {
  var exec = String(execString || "")
  var tokens = execTokens(exec)
  var index = commandIndex(tokens)
  if (index < 0) return false
  var command = basename(tokens[index])
  if (command === "omarchy-launch-webapp" || command.indexOf("omarchy-webapp-handler-") === 0) return true
  if (!browserExecutable.test(command)) return false
  for (var i = index + 1; i < tokens.length; i++) {
    if (tokens[i] === "--app" || tokens[i] === "--app-id") return true
    if (/^--app(?:-id)?=/.test(tokens[i])) return true
  }
  return false
}

function normalizeEntry(entry) {
  if (!entry || entry.noDisplay) return null
  var id = String(entry.id || "")
  if (!id) return null
  var exec = String(entry.execString || "")
  if (!isWebAppExec(exec)) return null
  return {
    id: id,
    name: String(entry.name || id),
    icon: String(entry.icon || ""),
    exec: exec,
    comment: String(entry.comment || "")
  }
}

function compareRecords(a, b) {
  var an = a.name.toLowerCase()
  var bn = b.name.toLowerCase()
  if (an < bn) return -1
  if (an > bn) return 1
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

function collectWebApps(entries) {
  var list = entries || []
  var out = []
  var seen = {}
  for (var i = 0; i < list.length; i++) {
    var rec = normalizeEntry(list[i])
    if (!rec || seen[rec.id]) continue
    seen[rec.id] = true
    out.push(rec)
  }
  out.sort(compareRecords)
  return out
}

function hiddenSet(hiddenIds) {
  var set = {}
  var list = hiddenIds || []
  for (var i = 0; i < list.length; i++) set[String(list[i])] = true
  return set
}

function matchesQuery(app, query) {
  var q = String(query || "").trim().toLowerCase()
  if (!q) return true
  return (app.name + " " + app.id + " " + app.comment).toLowerCase().indexOf(q) >= 0
}

function visibleWebApps(apps, hiddenIds, query) {
  var hidden = hiddenSet(hiddenIds)
  var out = []
  var list = apps || []
  for (var i = 0; i < list.length; i++) {
    var app = list[i]
    if (!app || hidden[app.id]) continue
    if (!matchesQuery(app, query)) continue
    out.push(app)
  }
  return out
}

function visibleCount(apps, hiddenIds) {
  return visibleWebApps(apps, hiddenIds, "").length
}

function toggleHidden(hiddenIds, id) {
  var target = String(id || "")
  if (!target) return (hiddenIds || []).map(String).sort()
  var hidden = hiddenSet(hiddenIds)
  if (hidden[target]) delete hidden[target]
  else hidden[target] = true
  return Object.keys(hidden).sort()
}

function setAllHidden(apps, hide) {
  if (!hide) return []
  var list = apps || []
  var ids = []
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].id) ids.push(String(list[i].id))
  return ids.sort()
}

function pruneHidden(hiddenIds, apps) {
  var present = {}
  var list = apps || []
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].id) present[list[i].id] = true
  var source = hiddenIds || []
  var out = []
  for (var j = 0; j < source.length; j++) {
    var id = String(source[j])
    if (present[id]) out.push(id)
  }
  return out
}

// Hyprland's own modmask bits (WLR_MODIFIER_*): SHIFT=1, CTRL=4, ALT=8,
// SUPER=64. Fixed display order regardless of bit order.
var MODMASK = { SUPER: 64, CTRL: 4, ALT: 8, SHIFT: 1 }
var MOD_ORDER = ["SUPER", "CTRL", "ALT", "SHIFT"]

// Formats one `hyprctl binds -j` row into a combo string, e.g. "SUPER + SHIFT
// + K". Returns "" for a row with no key (shouldn't happen in practice).
function comboFromBind(bind) {
  if (!bind || !bind.key) return ""
  var mask = Number(bind.modmask) || 0
  var out = ""
  for (var i = 0; i < MOD_ORDER.length; i++) {
    if (mask & MODMASK[MOD_ORDER[i]]) out += MOD_ORDER[i] + " + "
  }
  return out + String(bind.key).toUpperCase()
}

// Finds a live Hyprland bind for a web app by matching its display name
// against a bind's `description` — the one thing every source that assigns
// shortcuts in this ecosystem (Omarchy's preinstalled webapp bindings, the
// keysmith plugin, hand-written o.bind calls) sets to the app's name. Returns
// "" when no bind's description matches; best-effort, not exact — a renamed
// bind or an app whose name isn't used verbatim in it won't be found.
function shortcutForApp(binds, appName) {
  var list = binds || []
  var name = String(appName || "")
  if (!name) return ""
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].description === name) return comboFromBind(list[i])
  }
  return ""
}

// Builds the id -> combo map the panel displays and checks for conflicts
// against, from one `hyprctl binds -j` snapshot.
function shortcutsForApps(binds, apps) {
  var list = apps || []
  var map = {}
  for (var i = 0; i < list.length; i++) {
    var app = list[i]
    if (!app) continue
    var combo = shortcutForApp(binds, app.name)
    if (combo) map[app.id] = combo
  }
  return map
}

// Nothing here writes X-Omarchy-Shortcut=, so two web apps can independently
// end up with the same combo. Hyprland doesn't reject a duplicate bind, it
// fires every dispatcher on that key, so a shared combo is worth flagging
// rather than shown as if both keys actually work. Returns the set of app
// ids (as object keys) whose shortcut collides with another app's.
function shortcutConflicts(shortcuts) {
  var map = shortcuts || {}
  var counts = {}
  for (var id in map) {
    var combo = map[id]
    if (combo) counts[combo] = (counts[combo] || 0) + 1
  }
  var conflicted = {}
  for (var id2 in map) {
    var combo2 = map[id2]
    if (combo2 && counts[combo2] > 1) conflicted[id2] = true
  }
  return conflicted
}

function mergeSettings(current, changes) {
  var base = current && typeof current === "object" ? current : {}
  var next = {}
  for (var key in base) if (key !== "id") next[key] = base[key]
  var patch = changes && typeof changes === "object" ? changes : {}
  for (var k in patch) if (k !== "id") next[k] = patch[k]
  return next
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    isWebAppExec: isWebAppExec,
    normalizeEntry: normalizeEntry,
    collectWebApps: collectWebApps,
    hiddenSet: hiddenSet,
    matchesQuery: matchesQuery,
    visibleWebApps: visibleWebApps,
    visibleCount: visibleCount,
    toggleHidden: toggleHidden,
    setAllHidden: setAllHidden,
    pruneHidden: pruneHidden,
    comboFromBind: comboFromBind,
    shortcutForApp: shortcutForApp,
    shortcutsForApps: shortcutsForApps,
    shortcutConflicts: shortcutConflicts,
    mergeSettings: mergeSettings
  }
}
