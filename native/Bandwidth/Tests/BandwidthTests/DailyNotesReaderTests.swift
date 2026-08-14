import XCTest
@testable import Bandwidth

final class DailyNotesReaderTests: XCTestCase {
    private var root: URL!
    private let fileManager = FileManager.default

    override func setUpWithError() throws {
        root = fileManager.temporaryDirectory
            .appendingPathComponent("BandwidthDailyNotesTests-\(UUID().uuidString)")
        try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? fileManager.removeItem(at: root)
    }

    func testListsOnlyDateNamedMarkdownInsideConfiguredFolder() throws {
        let vault = root.appendingPathComponent("Deep Thought")
        let dailies = vault.appendingPathComponent("Storage/Dailies")
        try fileManager.createDirectory(at: dailies, withIntermediateDirectories: true)
        try fileManager.createDirectory(
            at: vault.appendingPathComponent(".obsidian"),
            withIntermediateDirectories: true
        )
        try #"{"folder":"Storage/Dailies"}"#.write(
            to: vault.appendingPathComponent(".obsidian/daily-notes.json"),
            atomically: true,
            encoding: .utf8
        )
        try "## Morning Brief\n\nPlan".write(
            to: dailies.appendingPathComponent("2026-08-13.md"),
            atomically: true,
            encoding: .utf8
        )
        try "Ignore".write(
            to: dailies.appendingPathComponent("scratch.md"),
            atomically: true,
            encoding: .utf8
        )
        let registry = """
        {
          "default_vault": "deep_thought",
          "vaults": {
            "deep_thought": {
              "display_name": "Deep Thought",
              "canonical_path": "\(vault.path)"
            }
          }
        }
        """
        let registryURL = root.appendingPathComponent("obsidian-vaults.json")
        try registry.write(to: registryURL, atomically: true, encoding: .utf8)

        let notes = try DeepThoughtDailyNotesReader(registryURL: registryURL).listDailyNotes()

        XCTAssertEqual(notes.count, 1)
        XCTAssertEqual(notes[0].date, "2026-08-13")
        XCTAssertEqual(notes[0].relativePath, "Storage/Dailies/2026-08-13.md")
        XCTAssertEqual(notes[0].markdown, "## Morning Brief\n\nPlan")
        XCTAssertTrue(notes[0].obsidianUrl.contains("vault=Deep%20Thought"))
        XCTAssertTrue(notes[0].obsidianUrl.contains("2026-08-13.md"))
    }

    func testRejectsConfiguredFolderOutsideCanonicalVault() throws {
        let vault = root.appendingPathComponent("Deep Thought")
        try fileManager.createDirectory(
            at: vault.appendingPathComponent(".obsidian"),
            withIntermediateDirectories: true
        )
        try #"{"folder":"../Outside"}"#.write(
            to: vault.appendingPathComponent(".obsidian/daily-notes.json"),
            atomically: true,
            encoding: .utf8
        )
        let outside = root.appendingPathComponent("Outside")
        try fileManager.createDirectory(at: outside, withIntermediateDirectories: true)
        let registry = """
        {
          "default_vault": "deep_thought",
          "vaults": {
            "deep_thought": {
              "display_name": "Deep Thought",
              "canonical_path": "\(vault.path)"
            }
          }
        }
        """
        let registryURL = root.appendingPathComponent("obsidian-vaults.json")
        try registry.write(to: registryURL, atomically: true, encoding: .utf8)

        XCTAssertThrowsError(
            try DeepThoughtDailyNotesReader(registryURL: registryURL).listDailyNotes()
        ) { error in
            XCTAssertEqual(
                error as? DailyNotesReaderError,
                .dailyNotesFolderOutsideVault
            )
        }
    }

    func testReportsMissingRegistryWithoutFallingBack() {
        let missing = root.appendingPathComponent("missing.json")
        XCTAssertThrowsError(
            try DeepThoughtDailyNotesReader(registryURL: missing).listDailyNotes()
        ) { error in
            XCTAssertEqual(error as? DailyNotesReaderError, .registryUnavailable)
        }
    }
}
