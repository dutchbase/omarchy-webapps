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

// Mirrors the bash `canonical_combo` in omarchy-webapp-shortcut: modifiers in
// a fixed order, "+" or bare spaces between tokens, last non-modifier token
// wins as the key. Returns "" when no key token is present.
function canonicalCombo(raw) {
  var tokens = String(raw || "").split(/[+\s]+/).filter(function (t) { return t.length > 0 })
  var seen = {}
  var key = ""
  for (var i = 0; i < tokens.length; i++) {
    var up = tokens[i].toUpperCase()
    if (up === "SUPER" || up === "WIN" || up === "MOD") seen.SUPER = true
    else if (up === "CTRL" || up === "CONTROL") seen.CTRL = true
    else if (up === "ALT" || up === "MOD1") seen.ALT = true
    else if (up === "SHIFT") seen.SHIFT = true
    else key = up
  }
  if (!key) return ""
  var mods = ["SUPER", "CTRL", "ALT", "SHIFT"]
  var out = ""
  for (var j = 0; j < mods.length; j++) if (seen[mods[j]]) out += mods[j] + " + "
  return out + key
}

// Reads the `X-Omarchy-Shortcut=` line a raw .desktop file may carry (written
// by the separate omarchy-webapp-shortcut tool) and canonicalizes it for
// display. Returns "" when the key is absent or unparseable.
function shortcutFromDesktopText(text) {
  var m = String(text || "").match(/^X-Omarchy-Shortcut=(.*)$/m)
  if (!m) return ""
  return canonicalCombo(m[1])
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
    canonicalCombo: canonicalCombo,
    shortcutFromDesktopText: shortcutFromDesktopText,
    mergeSettings: mergeSettings
  }
}
