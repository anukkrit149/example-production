'use client'

import { QRCodeSVG } from 'qrcode.react'
import type { LabelRow } from '@hf/labels'

/**
 * The label stock, as ink on paper.
 *
 * These are the four physical sticker colours at the tint the thermal printer
 * actually lays down — pale enough that black text and a black QR stay high
 * contrast, saturated enough that an operator can tell blue from green across a
 * workbench. They are NOT the pill colours from `globals.css`: a pill is a solid
 * chip carrying white text, a label is mostly white space carrying black text.
 * Oxblood never appears here; it is the interface accent, never a stage.
 */
const STOCK: Record<'white' | 'blue' | 'red' | 'yellow' | 'green', string> = {
  white: '#ffffff',
  blue: '#bcd3ff',
  red: '#ffc4bd',
  yellow: '#fff1a8',
  green: '#c4f0d2',
}

/**
 * Level M error correction, per the label spec. A sticker on a leather jacket
 * gets creased, scuffed and handled; M recovers about 15% of a damaged code,
 * which is what makes a worn label still scan at the next checkpoint.
 */
const QR_LEVEL = 'M'

/**
 * `size` is the pixel canvas the QR renders into. It is deliberately generous
 * relative to the millimetre box below: the SVG scales to the mm width, and a
 * larger module grid gives a crisper edge when the browser rounds
 * sub-millimetre modules to device pixels.
 */
const QR_PX = { small: 68, large: 113 } as const

/**
 * Type that fits the stock, measured rather than guessed.
 *
 * On 50 × 50 the 30 mm QR plus the gap eats 31.5 mm of the 47 mm of usable
 * height, leaving 15.5 mm for five lines. At the spec's 9 pt / 11 pt with 1.15
 * leading those five lines run to roughly 19.5 mm and the CHECK_LINE — the tick
 * boxes a worker actually pencils in — falls off the bottom of the sticker.
 * Tightened here so every line is inside the stock. The 50 × 25 lays the text
 * beside the QR instead of under it, so it keeps the roomier leading.
 */
const TYPE = {
  small: { stage: '8pt', body: '6.5pt', leading: 1.15 },
  large: { stage: '11pt', body: '7.5pt', leading: 1.1 },
} as const

/**
 * A mock print — the physical label at true size (FR-055).
 *
 * Everything here is measured in millimetres on purpose. An operator holds the
 * iPad against a sheet of blank 50 × 25 stock and checks that the QR and the
 * five text lines actually fit before committing a roll to the printer. Using
 * `px` would make that check a lie, so the box, the padding, the QR and the
 * gaps are all mm and the type is in points.
 */
export function LabelPreview({
  row,
  template,
  color,
}: {
  row: LabelRow
  template: '50x25' | '50x50'
  color: 'white' | 'blue' | 'red' | 'yellow' | 'green'
}) {
  const big = template === '50x50'
  const type = big ? TYPE.large : TYPE.small

  return (
    <div
      // The label is not part of the page's type system — it is a physical
      // object being simulated, so it carries the printer's own font stack and
      // pure black ink regardless of the app theme.
      style={{
        width: '50mm',
        height: big ? '50mm' : '25mm',
        background: STOCK[color],
        padding: '1.5mm',
        display: 'flex',
        flexDirection: big ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: big ? 'center' : 'flex-start',
        gap: '1.5mm',
        boxSizing: 'border-box',
        overflow: 'hidden',
        color: '#000',
        fontFamily: 'Helvetica, Arial, sans-serif',
        // A hairline marking exactly where the stock ends, and a clip on the
        // same edge. Together they are honest about the printer: a thermal head
        // cannot print past the label, so anything that would not fit does not
        // appear here either. Text touching this border is the warning sign.
        border: '0.2mm solid rgba(0,0,0,0.35)',
        borderRadius: '1mm',
        flex: '0 0 auto',
      }}
      // Read aloud on a screen reader as what it is, not as a pile of lines.
      role="img"
      aria-label={`Label preview, ${template} millimetres, ${color} stock: ${row.STAGE_TEXT}, ${row.STYLE_LINE}, ${row.DETAIL_LINE}, ${row.QTY_LINE}`}
    >
      <QRCodeSVG
        value={row.QR_VALUE}
        size={big ? QR_PX.large : QR_PX.small}
        level={QR_LEVEL}
        // The QR must stay square: `flex: 0 0 auto` stops the row layout from
        // squeezing it narrower than it is tall, which would make it unscannable.
        style={{
          width: big ? '30mm' : '18mm',
          height: big ? '30mm' : '18mm',
          flex: '0 0 auto',
          display: 'block',
        }}
        bgColor="transparent"
        fgColor="#000000"
      />

      <div
        style={{
          fontSize: type.body,
          lineHeight: type.leading,
          textAlign: big ? 'center' : 'left',
          minWidth: 0,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: type.stage, lineHeight: 1.1 }}>
          {row.STAGE_TEXT}
        </div>
        <div style={{ fontWeight: 700 }}>{row.STYLE_LINE}</div>
        <div>{row.DETAIL_LINE}</div>
        <div>{row.QTY_LINE}</div>
        {/*
          The tick boxes are the reason the label exists on the shop floor: a
          worker pencils them in as they count, set and check. Kept on one line —
          a wrapped "QA □" orphaned onto a sixth row is the thing that pushes the
          text off the bottom of the 50 × 50 stock.
        */}
        <div style={{ whiteSpace: 'nowrap' }}>{row.CHECK_LINE}</div>
      </div>
    </div>
  )
}
