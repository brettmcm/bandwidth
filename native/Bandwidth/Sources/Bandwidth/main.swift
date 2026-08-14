import AppKit
import Combine
import Darwin
import SwiftUI
import WebKit

struct DailyNotePayload: Codable, Equatable {
    let date: String
    let relativePath: String
    let modifiedAt: String
    let markdown: String
    let obsidianUrl: String

    var dictionary: [String: Any] {
        [
            "date": date,
            "relativePath": relativePath,
            "modifiedAt": modifiedAt,
            "markdown": markdown,
            "obsidianUrl": obsidianUrl,
        ]
    }
}

enum DailyNotesReaderError: LocalizedError, Equatable {
    case registryUnavailable
    case registryInvalid
    case vaultUnavailable
    case dailyNotesConfigurationUnavailable
    case dailyNotesFolderOutsideVault
    case dailyNotesFolderUnavailable

    var errorDescription: String? {
        switch self {
        case .registryUnavailable:
            return "Deep Thought’s vault registry could not be read."
        case .registryInvalid:
            return "Deep Thought’s vault registry is not configured correctly."
        case .vaultUnavailable:
            return "The canonical Deep Thought vault is unavailable."
        case .dailyNotesConfigurationUnavailable:
            return "Obsidian’s Daily Notes folder is not configured."
        case .dailyNotesFolderOutsideVault:
            return "Obsidian’s Daily Notes folder must stay inside Deep Thought."
        case .dailyNotesFolderUnavailable:
            return "Deep Thought’s Daily Notes folder is unavailable."
        }
    }
}

struct DeepThoughtDailyNotesReader {
    private struct VaultRegistry: Decodable {
        let defaultVault: String
        let vaults: [String: Vault]

        enum CodingKeys: String, CodingKey {
            case defaultVault = "default_vault"
            case vaults
        }
    }

    private struct Vault: Decodable {
        let canonicalPath: String
        let displayName: String

        enum CodingKeys: String, CodingKey {
            case canonicalPath = "canonical_path"
            case displayName = "display_name"
        }
    }

    private struct DailyNotesConfiguration: Decodable {
        let folder: String
    }

    let registryURL: URL
    private let fileManager: FileManager

    init(
        registryURL: URL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".codex/obsidian-vaults.json"),
        fileManager: FileManager = .default
    ) {
        self.registryURL = registryURL
        self.fileManager = fileManager
    }

    func listDailyNotes() throws -> [DailyNotePayload] {
        guard let registryData = fileManager.contents(atPath: registryURL.path) else {
            throw DailyNotesReaderError.registryUnavailable
        }
        guard let registry = try? JSONDecoder().decode(VaultRegistry.self, from: registryData),
              let vault = registry.vaults[registry.defaultVault] else {
            throw DailyNotesReaderError.registryInvalid
        }

        let vaultURL = URL(fileURLWithPath: (vault.canonicalPath as NSString).expandingTildeInPath)
            .standardizedFileURL
        var vaultIsDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: vaultURL.path, isDirectory: &vaultIsDirectory),
              vaultIsDirectory.boolValue else {
            throw DailyNotesReaderError.vaultUnavailable
        }

        let configurationURL = vaultURL
            .appendingPathComponent(".obsidian/daily-notes.json")
        guard let configurationData = fileManager.contents(atPath: configurationURL.path),
              let configuration = try? JSONDecoder().decode(
                DailyNotesConfiguration.self,
                from: configurationData
              ),
              !configuration.folder.isEmpty else {
            throw DailyNotesReaderError.dailyNotesConfigurationUnavailable
        }

        let notesURL = vaultURL.appendingPathComponent(configuration.folder).standardizedFileURL
        let vaultPrefix = vaultURL.path.hasSuffix("/") ? vaultURL.path : vaultURL.path + "/"
        guard notesURL.path.hasPrefix(vaultPrefix) else {
            throw DailyNotesReaderError.dailyNotesFolderOutsideVault
        }
        var notesIsDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: notesURL.path, isDirectory: &notesIsDirectory),
              notesIsDirectory.boolValue else {
            throw DailyNotesReaderError.dailyNotesFolderUnavailable
        }

        let keys: Set<URLResourceKey> = [.isRegularFileKey, .contentModificationDateKey]
        let files = try fileManager.contentsOfDirectory(
            at: notesURL,
            includingPropertiesForKeys: Array(keys),
            options: [.skipsHiddenFiles]
        )
        let filenamePattern = try NSRegularExpression(pattern: #"^\d{4}-\d{2}-\d{2}\.md$"#)
        let formatter = ISO8601DateFormatter()

        return try files.compactMap { fileURL in
            let filename = fileURL.lastPathComponent
            let range = NSRange(filename.startIndex..<filename.endIndex, in: filename)
            guard filenamePattern.firstMatch(in: filename, range: range) != nil else { return nil }
            let values = try fileURL.resourceValues(forKeys: keys)
            guard values.isRegularFile == true else { return nil }
            let markdown = try String(contentsOf: fileURL, encoding: .utf8)
            let relativePath = configuration.folder + "/" + filename
            var components = URLComponents()
            components.scheme = "obsidian"
            components.host = "open"
            components.queryItems = [
                URLQueryItem(name: "vault", value: vault.displayName),
                URLQueryItem(name: "file", value: relativePath),
            ]
            return DailyNotePayload(
                date: String(filename.dropLast(3)),
                relativePath: relativePath,
                modifiedAt: formatter.string(from: values.contentModificationDate ?? .distantPast),
                markdown: markdown,
                obsidianUrl: components.url?.absoluteString ?? ""
            )
        }
        .sorted { $0.date > $1.date }
    }
}

final class DailyNotesBridge: NSObject, WKScriptMessageHandlerWithReply {
    private let reader: DeepThoughtDailyNotesReader

    init(reader: DeepThoughtDailyNotesReader = DeepThoughtDailyNotesReader()) {
        self.reader = reader
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard message.name == "bandwidthDailyNotes" else {
            replyHandler(nil, "Unsupported native request.")
            return
        }
        do {
            replyHandler(try reader.listDailyNotes().map(\.dictionary), nil)
        } catch {
            replyHandler(nil, error.localizedDescription)
        }
    }
}

extension NSColor {
    static let bandwidthCanvas = NSColor(name: "BandwidthCanvas") { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            ? .black
            : .white
    }
}

enum ServerState: Equatable {
    case idle
    case starting
    case ready(URL)
    case failed(String)
}

@MainActor
final class ServerService: ObservableObject {
    @Published private(set) var state: ServerState = .idle

    private var coordinator: Process?
    private var logHandle: FileHandle?
    private var startupTask: Task<Void, Never>?
    private var stopping = false

    private var appName: String { "Bandwidth" }

    private var projectDirectory: URL? {
        let environment = ProcessInfo.processInfo.environment
        let configured = environment["BANDWIDTH_PROJECT_DIR"]
            ?? Bundle.main.object(forInfoDictionaryKey: "BandwidthDefaultProjectDir") as? String
        guard let path = configured, !path.isEmpty else { return nil }
        return URL(fileURLWithPath: (path as NSString).expandingTildeInPath, isDirectory: true)
    }

    private var port: Int {
        Bundle.main.object(forInfoDictionaryKey: "BandwidthPort") as? Int ?? 3000
    }

    private var primaryURL: URL {
        URL(string: "http://127.0.0.1:\(port)/")!
    }

    private var readinessURLs: [URL] {
        [
            primaryURL,
            URL(string: "http://127.0.0.1:\(port)/api/workload")!,
        ]
    }

    private var localhostReadinessURLs: [URL] {
        [
            URL(string: "http://localhost:\(port)/")!,
            URL(string: "http://localhost:\(port)/api/workload")!,
        ]
    }

    private var logURL: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(appName, isDirectory: true)
            .appendingPathComponent("native-wrapper.log")
    }

    func start() {
        guard state != .starting else { return }
        stop()
        state = .starting
        stopping = false

        startupTask = Task { [weak self] in
            guard let self else { return }
            await self.launchAndWait()
        }
    }

    func retry() {
        start()
    }

    func showLog() {
        let url = logURL
        if !FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            FileManager.default.createFile(atPath: url.path, contents: Data())
        }
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }

    func stop() {
        startupTask?.cancel()
        startupTask = nil
        stopping = true

        guard let process = coordinator else {
            closeLog()
            if state != .idle { state = .idle }
            return
        }

        if process.isRunning {
            process.terminate()
            let deadline = Date().addingTimeInterval(6)
            while process.isRunning && Date() < deadline {
                RunLoop.current.run(until: Date().addingTimeInterval(0.05))
            }

            if process.isRunning {
                Darwin.kill(process.processIdentifier, SIGKILL)
                process.waitUntilExit()
            }
        }

        coordinator = nil
        closeLog()
        state = .idle
    }

    private func launchAndWait() async {
        guard let projectDirectory else {
            fail("The project location is missing. Set BANDWIDTH_PROJECT_DIR and try again.")
            return
        }

        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: projectDirectory.path, isDirectory: &isDirectory),
              isDirectory.boolValue else {
            fail("The workload project could not be found at \(projectDirectory.path). Set BANDWIDTH_PROJECT_DIR if it moved.")
            return
        }

        let coordinatorScript = projectDirectory.appendingPathComponent("scripts/bandwidth-server.mjs")
        let vinextCLI = projectDirectory.appendingPathComponent("node_modules/vinext/dist/cli.js")
        guard FileManager.default.isReadableFile(atPath: coordinatorScript.path),
              FileManager.default.isReadableFile(atPath: vinextCLI.path) else {
            fail("Bandwidth is missing its local web runtime. Run npm install in the project, then retry.")
            return
        }

        let ipv4ServerAlreadyReady = await allReady(at: readinessURLs)
        let localhostServerAlreadyReady = await allReady(at: localhostReadinessURLs)
        if ipv4ServerAlreadyReady || localhostServerAlreadyReady {
            fail("Bandwidth is already running in a browser on port \(port). Stop that terminal server, then retry so the native app can manage its own copy.")
            return
        }

        guard let nodeURL = resolveNode() else {
            fail("Node.js 22 or newer could not be found. Set BANDWIDTH_NODE_PATH to the Node executable and retry.")
            return
        }

        do {
            try prepareLog()

            let process = Process()
            process.executableURL = nodeURL
            process.arguments = [coordinatorScript.path]
            process.currentDirectoryURL = projectDirectory
            process.standardOutput = logHandle
            process.standardError = logHandle

            var environment = ProcessInfo.processInfo.environment
            let nodeDirectory = nodeURL.deletingLastPathComponent().path
            environment["PATH"] = [nodeDirectory, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"].joined(separator: ":")
            environment["BANDWIDTH_PORT"] = String(port)
            environment["BANDWIDTH_HOST"] = "127.0.0.1"
            process.environment = environment

            process.terminationHandler = { [weak self, weak process] _ in
                Task { @MainActor in
                    guard let self, !self.stopping, self.coordinator === process else { return }
                    self.fail("The local server stopped unexpectedly. Open the log for details, then retry.")
                }
            }

            try process.run()
            coordinator = process
        } catch {
            fail("Bandwidth could not start its local server: \(error.localizedDescription)")
            return
        }

        let deadline = Date().addingTimeInterval(45)
        while !Task.isCancelled && Date() < deadline {
            if await allReady(at: readinessURLs) {
                record("[ready] \(primaryURL.absoluteString)")
                state = .ready(primaryURL)
                return
            }

            if coordinator?.isRunning != true {
                fail("The local server exited before it became ready. Open the log for details.")
                return
            }

            try? await Task.sleep(nanoseconds: 350_000_000)
        }

        if !Task.isCancelled {
            stopOwnedCoordinator()
            fail("The local server did not become ready within 45 seconds. Open the log for details.")
        }
    }

    private func allReady(at urls: [URL]) async -> Bool {
        for url in urls {
            var request = URLRequest(url: url)
            request.timeoutInterval = 1
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            do {
                let (_, response) = try await URLSession.shared.data(for: request)
                guard let http = response as? HTTPURLResponse,
                      (200..<400).contains(http.statusCode) else { return false }
            } catch {
                return false
            }
        }
        return true
    }

    private func resolveNode() -> URL? {
        let environment = ProcessInfo.processInfo.environment
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let candidates = [
            environment["BANDWIDTH_NODE_PATH"],
            "\(home)/.volta/bin/node",
            "\(home)/.nvm/versions/node/v24.15.0/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ].compactMap { $0 }

        return candidates
            .map { URL(fileURLWithPath: ($0 as NSString).expandingTildeInPath) }
            .first { FileManager.default.isExecutableFile(atPath: $0.path) }
    }

    private func prepareLog() throws {
        let directory = logURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: logURL.path, contents: Data())
        let handle = try FileHandle(forWritingTo: logURL)
        try handle.truncate(atOffset: 0)
        logHandle = handle
    }

    private func closeLog() {
        try? logHandle?.synchronize()
        try? logHandle?.close()
        logHandle = nil
    }

    private func stopOwnedCoordinator() {
        stopping = true
        if coordinator?.isRunning == true {
            coordinator?.terminate()
        }
        coordinator = nil
        closeLog()
    }

    private func fail(_ message: String) {
        record("[failed] \(message)")
        state = .failed(message)
    }

    private func record(_ line: String) {
        let entry = "\(ISO8601DateFormatter().string(from: Date())) \(line)\n"
        guard let data = entry.data(using: .utf8) else { return }

        if let logHandle {
            do {
                try logHandle.seekToEnd()
                try logHandle.write(contentsOf: data)
            } catch { }
            return
        }

        do {
            try FileManager.default.createDirectory(
                at: logURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: logURL, options: .atomic)
        } catch { }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let server = ServerService()

    func applicationDidFinishLaunching(_ notification: Notification) {
        server.start()
        DispatchQueue.main.async {
            NSApplication.shared.windows.forEach { window in
                window.sharingType = .readOnly
                window.titleVisibility = .hidden
                window.titlebarAppearsTransparent = true
                window.titlebarSeparatorStyle = .none
                window.backgroundColor = .bandwidthCanvas
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        server.stop()
    }
}

@main
struct BandwidthApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup("Bandwidth") {
            RootView(server: appDelegate.server)
                .frame(minWidth: 920, minHeight: 620)
        }
        .defaultSize(width: 1240, height: 780)
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) { }
        }
    }
}

struct RootView: View {
    @ObservedObject var server: ServerService

    var body: some View {
        Group {
            switch server.state {
            case .idle, .starting:
                StatusView(
                    title: "Bandwidth",
                    detail: "Preparing your workload runway…",
                    isLoading: true,
                    retry: nil,
                    showLog: server.showLog
                )
            case .ready(let url):
                BrowserView(url: url)
            case .failed(let message):
                StatusView(
                    title: "Bandwidth couldn’t open",
                    detail: message,
                    isLoading: false,
                    retry: server.retry,
                    showLog: server.showLog
                )
            }
        }
        .background(Color(nsColor: .bandwidthCanvas).ignoresSafeArea())
    }
}

struct StatusView: View {
    let title: String
    let detail: String
    let isLoading: Bool
    let retry: (() -> Void)?
    let showLog: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Circle()
                .fill(Color(red: 1.0, green: 0.28, blue: 0.0))
                .frame(width: 10, height: 10)

            Text(title)
                .font(.system(size: 30, weight: .semibold, design: .default))
                .tracking(-0.8)

            Text(detail)
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: 500, alignment: .leading)

            if isLoading {
                ProgressView()
                    .controlSize(.small)
            } else {
                HStack(spacing: 16) {
                    if let retry {
                        Button("Retry", action: retry)
                            .buttonStyle(.borderedProminent)
                    }
                    Button("Show log", action: showLog)
                        .buttonStyle(.plain)
                }
            }
        }
        .padding(48)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct BrowserView: NSViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.addScriptMessageHandler(
            context.coordinator.dailyNotesBridge,
            contentWorld: .page,
            name: "bandwidthDailyNotes"
        )
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: """
                window.bandwidth = Object.freeze({
                  listDailyNotes: () => window.webkit.messageHandlers.bandwidthDailyNotes.postMessage(null)
                });
                """,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.setValue(false, forKey: "drawsBackground")
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        context.coordinator.webView = webView
        let magnificationGesture = NSMagnificationGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleTimelineMagnification(_:))
        )
        webView.addGestureRecognizer(magnificationGesture)
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        guard webView.url != url else { return }
        webView.load(URLRequest(url: url))
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        weak var webView: WKWebView?
        let dailyNotesBridge = DailyNotesBridge()
        private var appActivationObserver: NSObjectProtocol?

        override init() {
            super.init()
            appActivationObserver = NotificationCenter.default.addObserver(
                forName: NSApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.webView?.evaluateJavaScript(
                    "window.dispatchEvent(new CustomEvent('bandwidth:app-active'))",
                    completionHandler: nil
                )
            }
        }

        deinit {
            if let appActivationObserver {
                NotificationCenter.default.removeObserver(appActivationObserver)
            }
        }

        @objc func handleTimelineMagnification(
            _ gesture: NSMagnificationGestureRecognizer
        ) {
            guard let webView else { return }

            let phase: String
            switch gesture.state {
            case .began:
                phase = "began"
            case .changed:
                phase = "changed"
            case .ended:
                phase = "ended"
            case .cancelled, .failed:
                phase = "cancelled"
            default:
                return
            }

            let location = gesture.location(in: webView)
            let clientX = Double(location.x - webView.bounds.minX)
            let clientY = Double(
                webView.isFlipped
                    ? location.y - webView.bounds.minY
                    : webView.bounds.maxY - location.y
            )
            let magnification = Double(gesture.magnification)
            gesture.magnification = 0

            let script = """
            window.dispatchEvent(new CustomEvent("bandwidth:timeline-magnify", {
              detail: {
                magnification: \(magnification),
                clientX: \(clientX),
                clientY: \(clientY),
                phase: "\(phase)"
              }
            }));
            """
            webView.evaluateJavaScript(script, completionHandler: nil)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            let isLocal = url.host == "127.0.0.1" || url.host == "localhost"
            if !isLocal {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                NSWorkspace.shared.open(url)
            }
            return nil
        }
    }
}
