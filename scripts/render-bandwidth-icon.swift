import AppKit

guard CommandLine.arguments.count == 2 else {
    fputs("Usage: render-bandwidth-icon.swift /path/to/icon.png\n", stderr)
    exit(2)
}

let output = URL(fileURLWithPath: CommandLine.arguments[1])
let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)

image.lockFocus()

NSColor(calibratedRed: 0.965, green: 0.957, blue: 0.93, alpha: 1).setFill()
NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()

let bars: [(CGFloat, CGFloat, CGFloat)] = [
    (742, 170, 410),
    (622, 170, 650),
    (502, 310, 542),
    (382, 170, 730),
    (262, 420, 432),
]

NSColor(calibratedWhite: 0.08, alpha: 1).setFill()
for (y, x, width) in bars {
    let path = NSBezierPath(roundedRect: NSRect(x: x, y: y, width: width, height: 36), xRadius: 18, yRadius: 18)
    path.fill()
}

NSColor(calibratedRed: 1.0, green: 0.28, blue: 0.0, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 214, y: 486, width: 68, height: 68)).fill()

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let representation = NSBitmapImageRep(data: tiff),
      let png = representation.representation(using: .png, properties: [:]) else {
    fputs("Unable to render Bandwidth icon.\n", stderr)
    exit(1)
}

try png.write(to: output)
