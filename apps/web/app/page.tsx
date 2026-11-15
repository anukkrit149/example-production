import { redirect } from 'next/navigation'

/**
 * There is no landing page. Opening the app on the floor means picking one of
 * the three doors on Home. The checkpoint layout bounces an unauthenticated
 * visitor on to /signin from there.
 */
export default function Home() {
  redirect('/home')
}
