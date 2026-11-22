// Dibuja el icono de Ronin ASCII (1024x1024 PNG): 浪人 en rojo sobre noche,
// hierba hecha de caracteres, luna y un torii. Uso: swift tools/icono.swift salida.png
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icono.png"
let S: CGFloat = 1024
let img = NSImage(size: NSSize(width: S, height: S))
img.lockFocus()
let ctx = NSGraphicsContext.current!.cgContext

// fondo: cuadrado redondeado, degradado de noche índigo a negro
let inset: CGFloat = 100, r: CGFloat = 185
let card = NSRect(x: inset, y: inset, width: S - inset * 2, height: S - inset * 2)
let shape = NSBezierPath(roundedRect: card, xRadius: r, yRadius: r)
shape.addClip()
NSGradient(colors: [NSColor(red: 0.09, green: 0.11, blue: 0.22, alpha: 1), NSColor(red: 0.01, green: 0.015, blue: 0.03, alpha: 1)])!
  .draw(in: card, angle: -90)

func text(_ s: String, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat, _ color: NSColor, bold: Bool = true, font: String = "Courier New") {
  let f = NSFont(name: bold ? "\(font) Bold" : font, size: size) ?? NSFont.monospacedSystemFont(ofSize: size, weight: bold ? .bold : .regular)
  (s as NSString).draw(at: NSPoint(x: x, y: y), withAttributes: [.font: f, .foregroundColor: color])
}

// estrellas
var seed: UInt64 = 7
func rnd() -> CGFloat { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return CGFloat(seed >> 33) / CGFloat(1 << 31) }
for _ in 0..<70 { text(["'", "`", ".", "*"][Int(rnd() * 4)], inset + rnd() * card.width, 560 + rnd() * 330, 22, NSColor(white: 1, alpha: 0.25 + rnd() * 0.45), bold: false) }

// luna con halo
let moon = NSPoint(x: 700, y: 760)
NSGradient(colors: [NSColor(red: 0.75, green: 0.82, blue: 1, alpha: 0.35), NSColor(red: 0.75, green: 0.82, blue: 1, alpha: 0)])!
  .draw(fromCenter: moon, radius: 0, toCenter: moon, radius: 170, options: [])
NSColor(red: 0.96, green: 0.94, blue: 0.86, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: moon.x - 62, y: moon.y - 62, width: 124, height: 124)).fill()

// torii al fondo
let red = NSColor(red: 0.85, green: 0.2, blue: 0.14, alpha: 1)
red.setFill()
for x in [258.0, 418.0] { NSBezierPath(rect: NSRect(x: x, y: 330, width: 22, height: 300)).fill() }
NSColor(red: 0.08, green: 0.07, blue: 0.09, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 215, y: 620, width: 268, height: 26), xRadius: 8, yRadius: 8).fill()
red.setFill()
NSBezierPath(rect: NSRect(x: 232, y: 595, width: 234, height: 18)).fill()
NSBezierPath(rect: NSRect(x: 245, y: 548, width: 208, height: 14)).fill()

// hierba hecha de caracteres, más densa y clara cerca
let blades = ["/", "|", "\\", "(", ";", "'", ",", "\""]
var y: CGFloat = 470
while y > 70 {
  let k = (470 - y) / 400, size = 26 + k * 22
  var x = inset - 10 + rnd() * 20
  while x < S - inset {
    let g = 0.35 + k * 0.5 + rnd() * 0.15
    text(blades[Int(rnd() * CGFloat(blades.count))], x, y, size, NSColor(red: 0.25 * g, green: 0.85 * g, blue: 0.62 * g, alpha: 0.9), bold: true)
    x += size * 0.62 + rnd() * 6
  }
  y -= size * 0.72
}

// 浪人 en grande, con sombra
let shadow = NSShadow(); shadow.shadowColor = NSColor.black.withAlphaComponent(0.9); shadow.shadowBlurRadius = 30; shadow.set()
let kanji = NSFont(name: "Hiragino Mincho ProN W6", size: 330) ?? NSFont.systemFont(ofSize: 330, weight: .heavy)
("浪人" as NSString).draw(at: NSPoint(x: 182, y: 185), withAttributes: [.font: kanji, .foregroundColor: NSColor(red: 1, green: 0.36, blue: 0.29, alpha: 1)])
NSShadow().set()
text("RONIN ASCII", 300, 118, 58, NSColor(red: 1, green: 0.84, blue: 0.5, alpha: 1))

ctx.flush()
img.unlockFocus()
let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("icono: \(out)")
