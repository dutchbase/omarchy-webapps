import QtQuick
import QtQuick.Window
import Quickshell
import qs.Commons
import qs.Ui
import "WebApps.js" as WebApps

// The web app panel. One KeyboardPanel with two modes: 0 = launcher (list,
// search, launch), 1 = settings (choose which apps appear). Shape contract for
// the bar popout coordinator lives on BarWidget.qml.
Panel {
  id: root
  moduleName: "dutchbase.webapps"
  ipcTarget: "dutchbase.webapps"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  readonly property color contentForeground: bar ? bar.barForeground : Color.foreground
  readonly property color accentColor: Color.accent
  readonly property string contentFontFamily: bar ? bar.fontFamily : Style.font.family

  // 0 = launcher, 1 = settings
  property int mode: 0
  property string query: ""
  property int cursor: 0
  property int entryRevision: 0

  readonly property int rowHeight: Style.space(40)
  readonly property int listCap: Style.space(340)

  readonly property var allApps: {
    entryRevision
    return WebApps.collectWebApps(DesktopEntries.applications.values)
  }
  readonly property var hiddenApps: {
    var value = setting("hiddenApps", [])
    return Array.isArray(value) ? value : []
  }
  readonly property var listedApps: WebApps.visibleWebApps(allApps, hiddenApps, query)
  readonly property var activeApps: mode === 0 ? listedApps : allApps

  function open() {
    root.mode = 0
    root.query = ""
    root.cursor = 0
    root.entryRevision++
    root.controller.show()
  }
  function close() { root.controller.hide() }
  function toggle() { root.opened ? root.close() : root.open() }
  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function setMode(next) {
    root.mode = next
    root.query = ""
    root.cursor = 0
    Qt.callLater(root.revealCursor)
  }

  function moveCursor(delta) {
    var n = root.activeApps.length
    if (n <= 0) { root.cursor = 0; return }
    root.cursor = Math.max(0, Math.min(n - 1, root.cursor + delta))
    root.revealCursor()
  }

  function setCursor(index) {
    var n = root.activeApps.length
    if (n <= 0) return
    root.cursor = Math.max(0, Math.min(n - 1, index))
  }

  function revealCursor() {
    if (root.mode === 0 && appList.count > 0) appList.positionViewAtIndex(root.cursor, ListView.Contain)
    if (root.mode === 1 && settingsList.count > 0) settingsList.positionViewAtIndex(root.cursor, ListView.Contain)
  }

  function activateCursor() {
    var app = root.activeApps[root.cursor]
    if (!app) return
    if (root.mode === 0) root.launchApp(app)
    else root.toggleApp(app)
  }

  function launchApp(app) {
    root.close()
    Util.execDetached("uwsm-app -- gtk-launch " + Util.shellQuote(app.id + ".desktop"))
  }

  function toggleApp(app) {
    root.persistHidden(WebApps.toggleHidden(root.hiddenApps, app.id))
  }

  function persistHidden(nextHidden) {
    var entry = WebApps.mergeSettings(root.settings, { hiddenApps: nextHidden })
    root.settings = entry
    if (root.hostWidget && "settings" in root.hostWidget) root.hostWidget.settings = entry
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName, entry)
  }

  function showAll() { root.persistHidden([]) }
  function hideAll() { root.persistHidden(WebApps.setAllHidden(root.allApps, true)) }

  function isShown(app) {
    return root.hiddenApps.indexOf(app.id) < 0
  }

  function iconSource(icon) {
    var value = String(icon || "")
    if (value.length === 0) return Quickshell.iconPath("application-x-executable", true)
    if (value.indexOf("file://") === 0 || value.indexOf("image://") === 0) return value
    if (value.charAt(0) === "/") return Util.fileUrl(value)
    var themed = Quickshell.iconPath(value, true)
    if (themed.length > 0) return themed
    return Quickshell.iconPath("application-x-executable", true)
  }

  onQueryChanged: {
    root.cursor = 0
    Qt.callLater(root.revealCursor)
  }

  Connections {
    target: DesktopEntries.applications
    function onValuesChanged() { root.entryRevision++ }
  }

  onAllAppsChanged: {
    var pruned = WebApps.pruneHidden(root.hiddenApps, root.allApps)
    if (pruned.length !== root.hiddenApps.length) root.persistHidden(pruned)
    if (root.cursor >= root.activeApps.length) root.cursor = Math.max(0, root.activeApps.length - 1)
  }

  function handleKey(event) {
    if (event.key === Qt.Key_Escape) {
      if (root.mode === 1) root.setMode(0)
      else if (root.query) root.query = ""
      else root.close()
      return true
    }
    if (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
      root.setMode(root.mode === 0 ? 1 : 0)
      return true
    }
    if (event.key === Qt.Key_Up) { root.moveCursor(-1); return true }
    if (event.key === Qt.Key_Down) { root.moveCursor(1); return true }
    if (event.key === Qt.Key_PageUp) { root.moveCursor(-6); return true }
    if (event.key === Qt.Key_PageDown) { root.moveCursor(6); return true }
    if (event.key === Qt.Key_Home) { root.setCursor(0); return true }
    if (event.key === Qt.Key_End) { root.setCursor(root.activeApps.length - 1); return true }
    if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) { root.activateCursor(); return true }

    if (root.mode === 0) {
      if (Util.editsFilter(event, root.query)) { root.query = Util.editedFilter(event, root.query); return true }
      if (event.text && event.text.length === 1 && event.text.charCodeAt(0) >= 32 && event.text.charCodeAt(0) !== 127) {
        root.query += event.text
        return true
      }
      return false
    }
    if (event.key === Qt.Key_Space) { root.activateCursor(); return true }
    return false
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(360))
    contentHeight: panel.fittedContentHeight(content.implicitHeight, Style.space(520))

    Item {
      id: keyCatcher
      anchors.fill: parent
      focus: true
      Keys.priority: Keys.BeforeItem
      Keys.onPressed: function (event) {
        if (root.handleKey(event)) event.accepted = true
      }
    }

    Column {
      id: content
      width: parent.width
      spacing: Style.space(8)

      // Hero: glyph, title, live count, actions, gear.
      Item {
        width: parent.width
        height: Math.max(heroGlyph.implicitHeight, heroCol.implicitHeight, heroRight.height)

        Text {
          id: heroGlyph
          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          text: root.mode === 0 ? "󰖟" : "󰒓"
          color: root.contentForeground
          font.family: root.contentFontFamily
          font.pixelSize: Style.font.display
        }

        Row {
          id: heroRight
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          spacing: Style.space(12)

          Text {
            id: showAllText
            visible: root.mode === 1
            anchors.verticalCenter: parent.verticalCenter
            text: "Show all"
            color: showAllMouse.hovered
              ? Style.hoverStateColor(root.contentForeground, root.accentColor)
              : Qt.darker(root.contentForeground, 1.4)
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.caption
            font.underline: showAllMouse.hovered

            MouseArea {
              id: showAllMouse
              anchors.fill: parent
              anchors.margins: -Style.space(4)
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: root.showAll()
            }
          }

          Text {
            id: hideAllText
            visible: root.mode === 1
            anchors.verticalCenter: parent.verticalCenter
            text: "Hide all"
            color: hideAllMouse.hovered
              ? Style.hoverStateColor(root.contentForeground, root.accentColor)
              : Qt.darker(root.contentForeground, 1.4)
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.caption
            font.underline: hideAllMouse.hovered

            MouseArea {
              id: hideAllMouse
              anchors.fill: parent
              anchors.margins: -Style.space(4)
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: root.hideAll()
            }
          }

          PanelActionButton {
            id: gear
            anchors.verticalCenter: parent.verticalCenter
            iconText: root.mode === 0 ? "󰒓" : "󰅁"
            tooltipText: root.mode === 0 ? "Choose web apps" : "Back"
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            onClicked: root.setMode(root.mode === 0 ? 1 : 0)
          }
        }

        Column {
          id: heroCol
          anchors.left: heroGlyph.right
          anchors.leftMargin: Style.space(12)
          anchors.right: heroRight.left
          anchors.rightMargin: Style.space(12)
          anchors.verticalCenter: parent.verticalCenter
          spacing: Style.space(1)

          Text {
            width: parent.width
            text: root.mode === 0 ? "Web Apps" : "Choose web apps"
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.title
            font.bold: true
            elide: Text.ElideRight
          }

          Text {
            width: parent.width
            text: root.mode === 0
              ? WebApps.visibleCount(root.allApps, root.hiddenApps) + " shown"
              : "Toggle which apps appear"
            color: Qt.darker(root.contentForeground, 1.4)
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
          }
        }
      }

      PanelSeparator { foreground: root.contentForeground }

      // Query line + result count (launcher only).
      Item {
        width: parent.width
        visible: root.mode === 0
        height: visible ? queryText.implicitHeight : 0

        Text {
          id: queryText
          anchors.left: parent.left
          anchors.right: countText.left
          anchors.rightMargin: Style.space(8)
          anchors.verticalCenter: parent.verticalCenter
          text: root.query === "" ? "Search web apps…" : root.query
          color: root.contentForeground
          opacity: root.query ? 1 : 0.58
          font.family: root.contentFontFamily
          font.pixelSize: Style.font.body
          elide: Text.ElideRight
        }

        Text {
          id: countText
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          text: root.listedApps.length + " / " + root.allApps.length
          color: Qt.darker(root.contentForeground, 1.5)
          font.family: root.contentFontFamily
          font.pixelSize: Style.font.caption
        }
      }

      // Launcher list.
      ListView {
        id: appList
        width: parent.width
        visible: root.mode === 0
        height: visible ? Math.min(root.listCap, Math.max(root.rowHeight, appList.count * root.rowHeight)) : 0
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height
        model: root.listedApps
        spacing: 0

        delegate: Rectangle {
          id: launcherRow
          required property var modelData
          required property int index

          width: appList.width
          height: root.rowHeight
          radius: Style.cornerRadius
          color: index === root.cursor
            ? Style.selectedFillFor(root.contentForeground, root.accentColor)
            : (launcherHover.hovered ? Style.hoverFillFor(root.contentForeground, root.accentColor) : "transparent")

          Behavior on color {
            enabled: !root.bar || root.bar.foregroundAnimationEnabled
            ColorAnimation { duration: 100 }
          }

          Row {
            anchors.fill: parent
            anchors.leftMargin: Style.space(10)
            anchors.rightMargin: Style.space(10)
            spacing: Style.space(10)

            Image {
              anchors.verticalCenter: parent.verticalCenter
              width: Style.space(22)
              height: Style.space(22)
              sourceSize.width: width * (Screen.devicePixelRatio || 1)
              sourceSize.height: height * (Screen.devicePixelRatio || 1)
              fillMode: Image.PreserveAspectFit
              asynchronous: true
              source: root.iconSource(launcherRow.modelData.icon)
            }

            Text {
              anchors.verticalCenter: parent.verticalCenter
              width: parent.width - x
              text: launcherRow.modelData.name
              color: index === root.cursor
                ? Style.selectedStateColor(root.contentForeground, root.accentColor)
                : root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
              elide: Text.ElideRight
            }
          }

          Rectangle {
            visible: index === root.cursor
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            width: Math.max(2, Style.space(2))
            height: parent.height - Style.space(14)
            radius: width / 2
            color: Style.selectedStateColor(root.contentForeground, root.accentColor)
          }

          MouseArea {
            id: launcherHover
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onPositionChanged: root.setCursor(launcherRow.index)
            onClicked: root.launchApp(launcherRow.modelData)
          }
        }
      }

      // Settings list: every web app, with a themed switch for visibility.
      ListView {
        id: settingsList
        width: parent.width
        visible: root.mode === 1
        height: visible ? Math.min(root.listCap, Math.max(root.rowHeight, settingsList.count * root.rowHeight)) : 0
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height
        model: root.mode === 1 ? root.allApps : []
        spacing: 0

        delegate: Rectangle {
          id: settingsRow
          required property var modelData
          required property int index

          readonly property bool shown: root.isShown(settingsRow.modelData)

          width: settingsList.width
          height: root.rowHeight
          radius: Style.cornerRadius
          color: index === root.cursor
            ? Style.selectedFillFor(root.contentForeground, root.accentColor)
            : (settingsHover.hovered ? Style.hoverFillFor(root.contentForeground, root.accentColor) : "transparent")

          Behavior on color {
            enabled: !root.bar || root.bar.foregroundAnimationEnabled
            ColorAnimation { duration: 100 }
          }

          Row {
            anchors.fill: parent
            anchors.leftMargin: Style.space(10)
            anchors.rightMargin: Style.space(10)
            spacing: Style.space(10)

            Image {
              anchors.verticalCenter: parent.verticalCenter
              width: Style.space(22)
              height: Style.space(22)
              sourceSize.width: width * (Screen.devicePixelRatio || 1)
              sourceSize.height: height * (Screen.devicePixelRatio || 1)
              fillMode: Image.PreserveAspectFit
              asynchronous: true
              opacity: settingsRow.shown ? 1 : 0.55
              source: root.iconSource(settingsRow.modelData.icon)
            }

            Text {
              anchors.verticalCenter: parent.verticalCenter
              width: parent.width - x - visibilitySwitch.width - Style.space(10)
              text: settingsRow.modelData.name
              color: root.contentForeground
              opacity: settingsRow.shown ? 1 : 0.55
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
              elide: Text.ElideRight
            }

            ToggleSwitch {
              id: visibilitySwitch
              anchors.verticalCenter: parent.verticalCenter
              checked: settingsRow.shown
              interactive: false
              cursorRing: false
              hasCursor: false
              foreground: root.contentForeground
              accent: root.accentColor
            }
          }

          Rectangle {
            visible: index === root.cursor
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            width: Math.max(2, Style.space(2))
            height: parent.height - Style.space(14)
            radius: width / 2
            color: Style.selectedStateColor(root.contentForeground, root.accentColor)
          }

          MouseArea {
            id: settingsHover
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onPositionChanged: root.setCursor(settingsRow.index)
            onClicked: root.toggleApp(settingsRow.modelData)
          }
        }
      }

      // Empty state (launcher or settings).
      Item {
        width: parent.width
        visible: (root.mode === 0 && root.listedApps.length === 0)
          || (root.mode === 1 && root.allApps.length === 0)
        height: visible ? root.rowHeight * 2 : 0

        Column {
          anchors.centerIn: parent
          spacing: Style.space(4)

          Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "󰖟"
            color: Qt.darker(root.contentForeground, 1.6)
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.display
          }

          Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.allApps.length === 0
              ? "No web apps found — install one from the Omarchy menu"
              : "No web apps match"
            color: Qt.darker(root.contentForeground, 1.4)
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.body
          }
        }
      }

      // Footer hint.
      Text {
        width: parent.width
        horizontalAlignment: Text.AlignHCenter
        text: root.mode === 0
          ? "↑↓ navigate   ↵ open   type to filter   esc close"
          : "↑↓ navigate   space toggle   tab/esc back"
        color: Qt.darker(root.contentForeground, 1.7)
        font.family: root.contentFontFamily
        font.pixelSize: Style.font.caption
        elide: Text.ElideRight
      }
    }
  }
}
