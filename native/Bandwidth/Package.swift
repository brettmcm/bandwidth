// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "Bandwidth",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "Bandwidth", targets: ["Bandwidth"]),
    ],
    targets: [
        .executableTarget(
            name: "Bandwidth",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("WebKit"),
            ]
        ),
        .testTarget(name: "BandwidthTests", dependencies: ["Bandwidth"]),
    ],
    swiftLanguageVersions: [.v5]
)
