import { redirect } from 'next/navigation'
/** The dashboard opens on the factory pulse; the (dashboard) layout handles sign-in. */
export default function Home() {
  redirect('/overview')
}
