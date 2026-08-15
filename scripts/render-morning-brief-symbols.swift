import AppKit

struct SymbolAsset {
    let filename: String
    let names: [String]
}

let assets = [
    SymbolAsset(filename: "calendar.png", names: ["calendar"]),
    SymbolAsset(filename: "video-fill.png", names: ["video.fill", "video"]),
    SymbolAsset(filename: "circle-dotted.png", names: ["circle.dotted", "timer"]),
    SymbolAsset(filename: "circle.png", names: ["circle"]),
    SymbolAsset(filename: "checkmark-circle-fill.png", names: ["checkmark.circle.fill"]),
]

guard CommandLine.arguments.count == 2 else {
    fputs("Usage: render-morning-brief-symbols.swift /path/to/output-directory\n", stderr)
    exit(2)
}

let outputDirectory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

let configuration = NSImage.SymbolConfiguration(pointSize: 17, weight: .regular)
let canvasSize = NSSize(width: 40, height: 40)

for asset in assets {
    guard let source = asset.names.lazy.compactMap({ name in
        NSImage(systemSymbolName: name, accessibilityDescription: nil)?
            .withSymbolConfiguration(configuration)
    }).first else {
        fputs("Unable to resolve an SF Symbol for \(asset.filename).\n", stderr)
        exit(1)
    }

    let rendered = NSImage(size: canvasSize)
    rendered.lockFocus()
    NSColor.clear.setFill()
    NSBezierPath(rect: NSRect(origin: .zero, size: canvasSize)).fill()

    let intrinsic = source.size
    let scale = min(30 / intrinsic.width, 30 / intrinsic.height)
    let targetSize = NSSize(width: intrinsic.width * scale, height: intrinsic.height * scale)
    let targetRect = NSRect(
        x: (canvasSize.width - targetSize.width) / 2,
        y: (canvasSize.height - targetSize.height) / 2,
        width: targetSize.width,
        height: targetSize.height
    )
    source.draw(in: targetRect, from: .zero, operation: .sourceOver, fraction: 1)
    rendered.unlockFocus()

    guard let tiff = rendered.tiffRepresentation,
          let representation = NSBitmapImageRep(data: tiff),
          let png = representation.representation(using: .png, properties: [:]) else {
        fputs("Unable to render \(asset.filename).\n", stderr)
        exit(1)
    }

    try png.write(to: outputDirectory.appendingPathComponent(asset.filename))
}
