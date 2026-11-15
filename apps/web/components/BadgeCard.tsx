'use client'

import { QRCodeSVG } from 'qrcode.react'

/**
 * Level Q, not the label stock's M.
 *
 * A piece label lives on a jacket for a few days. An ID card lives round
 * someone's neck for a year: it gets bent in a pocket, rubbed against a bench,
 * and wiped with whatever is to hand. Q recovers about a quarter of a damaged
 * code instead of M's fifteen percent, and the card has room to spare, so the
 * extra modules cost nothing that matters.
 */
const QR_LEVEL = 'Q'

/**
 * The pixel canvas the QR renders into, generously larger than the 34 mm it is
 * drawn at. The SVG scales to the millimetre box; a bigger module grid gives a
 * crisper edge once the printer rounds sub-millimetre modules to dots.
 */
const QR_PX = 260

/**
 * The card itself, at true size.
 *
 * 54 × 86 mm is CR80 turned portrait — the size of the plastic ID card and of
 * every lanyard holder that fits one — so this prints, gets trimmed, and drops
 * straight into the holder the operator already wears. Everything is in
 * millimetres for the same reason the label preview is: an admin holding the
 * printout against a blank card has to be checking the real thing, and `px`
 * would make that check a lie.
 *
 * What is on it is what a person needs and nothing else. The name is large
 * because the card's second job — after signing its holder in — is letting a
 * supervisor see whose card this is across a bench. The token is printed in
 * small type under the QR so a scuffed card can still be identified and
 * revoked by its last four characters, which is what the admin list shows.
 */
export function BadgeCard({
  name,
  role,
  url,
  token,
}: {
  name: string
  role: string
  url: string
  token: string
}) {
  return (
    <div
      className="hf-print-card"
      style={{
        width: '54mm',
        height: '86mm',
        background: '#ffffff',
        color: '#000',
        padding: '4mm',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '2mm',
        // A hairline showing exactly where to trim, and the honest edge of the
        // card: anything touching this line will not survive the guillotine.
        border: '0.2mm solid rgba(0,0,0,0.35)',
        borderRadius: '2mm',
        overflow: 'hidden',
        fontFamily: 'Helvetica, Arial, sans-serif',
        flex: '0 0 auto',
      }}
      role="img"
      aria-label={`ID card for ${name}, ${role}. Scan the QR code to sign in.`}
    >
      <div style={{ textAlign: 'center', width: '100%' }}>
        <div style={{ fontSize: '7pt', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
          Sample Factory
        </div>
        <div
          style={{
            fontSize: '13pt',
            fontWeight: 700,
            lineHeight: 1.15,
            marginTop: '2mm',
            // A long name wraps rather than running off the trim line.
            overflowWrap: 'anywhere',
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: '1mm' }}>
          {role}
        </div>
      </div>

      <QRCodeSVG
        value={url}
        size={QR_PX}
        level={QR_LEVEL}
        // The QR must stay square. `flex: 0 0 auto` stops the column layout from
        // squashing it shorter than it is wide, which makes it unscannable.
        style={{ width: '34mm', height: '34mm', flex: '0 0 auto', display: 'block' }}
        bgColor="#ffffff"
        fgColor="#000000"
      />

      <div style={{ textAlign: 'center', width: '100%' }}>
        {/*
          Hindi first, and the only instruction on the card. The operator holding
          it is the person who could not read the English sign-in screen; if this
          line does not work, the card does not work.
        */}
        <div style={{ fontSize: '8.5pt', fontWeight: 700, lineHeight: 1.2 }}>
          फ़ोन का कैमरा इस QR पर रखें
        </div>
        <div style={{ fontSize: '7pt', lineHeight: 1.2, marginTop: '0.8mm' }}>
          Point the phone camera at this code to sign in
        </div>
        <div style={{ fontSize: '6pt', fontFamily: 'monospace', marginTop: '1.5mm', letterSpacing: '0.04em' }}>
          {token}
        </div>
      </div>
    </div>
  )
}
