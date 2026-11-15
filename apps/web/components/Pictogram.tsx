import type { Pictogram as Key } from '@hf/domain'

/** The picture on a checklist step. Plain <img>: the SVGs are static, ink on transparent, and never need theming. */
export function Pictogram({ name, size = 160 }: { name: Key | string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- static, ink-on-transparent SVG asset; next/image's optimization buys nothing here
  return <img src={`/pictograms/${name}.svg`} alt="" width={size} height={size} style={{ width: size, height: size }} draggable={false} />
}
