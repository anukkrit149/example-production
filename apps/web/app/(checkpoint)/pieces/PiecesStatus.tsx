'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { FloorGroup, FloorPieceRow } from '@hf/server'
import { formatAge, formatSerial, stageColor, stageTextColor } from '@hf/server/format'
import { stageForState } from '@hf/domain'
import { stateName, type Key } from '@/lib/i18n/dictionary'
import { useT } from '@/lib/i18n/useT'
import { TextField } from '@/components/TextField'

const CHIPS: { group: FloorGroup; key: Key }[] = [
  { group: 'all', key: 'pieces_filter_all' },
  { group: 'cutting', key: 'stage_cutting' },
  { group: 'pasting', key: 'stage_pasting' },
  { group: 'stitching', key: 'stage_stitching' },
  { group: 'finishing', key: 'stage_finishing' },
  { group: 'qc', key: 'stage_qc' },
  { group: 'packed', key: 'stage_packed' },
  { group: 'on_hold', key: 'pieces_on_hold' },
]

const SEARCH_DEBOUNCE_MS = 300

type ListResponse = { rows: FloorPieceRow[]; nextBefore: string | null }

/**
 * Pieces Status's whole client: the stage chips, the search box, the row
 * list and Load more.
 *
 * The server's first page (`group=all`) is what paints before any script
 * runs; every filter, search keystroke and page after that is a fetch to
 * `/api/pieces`, replacing `initial` state entirely for chips and search but
 * appending for Load more — the one place rows must never repeat.
 */
export function PiecesStatus({ initial }: { initial: ListResponse }) {
  const { t, lang } = useT()
  const [group, setGroup] = useState<FloorGroup>('all')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  /*
   * One piece of state for the loaded page, not a separate `rows` +
   * `loading` pair: a filter change mid-flight must not leave the previous
   * filter's rows on screen while the new page loads, and two setStates in
   * the effect body would do exactly that. The loaded page carries the
   * group/query it belongs to, so anything that does not match current state
   * still reads as loading — the same key `WorkerPicker` uses for its list.
   */
  const [loaded, setLoaded] = useState<{ group: FloorGroup; query: string } & ListResponse>({
    group: 'all',
    query: '',
    ...initial,
  })
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const loading = loaded.group !== group || loaded.query !== debouncedQuery

  const fetchPage = useCallback(async (g: FloorGroup, q: string, before?: string) => {
    const params = new URLSearchParams({ group: g })
    if (q) params.set('q', q)
    if (before) params.set('before', before)
    const res = await fetch(`/api/pieces?${params.toString()}`)
    if (!res.ok) throw new Error('failed to load pieces')
    return (await res.json()) as ListResponse
  }, [])

  // A keystroke only updates `debouncedQuery` 300 ms after the last one, so
  // typing does not fire a request per character; a chip tap reloads at once
  // because it changes `group` directly, no debounce involved.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // The one place a page actually loads: a stage chip or a settled search
  // term. `live` guards against a stale response landing after a newer
  // request already changed `group`/`debouncedQuery` and unmounted this run.
  //
  // The very first run would otherwise repeat the server's own request: on
  // mount `group`/`debouncedQuery` already equal `loaded.group`/`loaded.query`
  // (the server-rendered `initial` page), so there is nothing to fetch yet —
  // only re-fetch once state has actually diverged from what is loaded.
  useEffect(() => {
    if (group === loaded.group && debouncedQuery === loaded.query) return
    let live = true
    fetchPage(group, debouncedQuery)
      .then((data) => {
        if (live) {
          setLoadError(false)
          setLoaded({ group, query: debouncedQuery, ...data })
        }
      })
      .catch(() => {
        // A failed page must not leave `loading` stuck forever: fall back to
        // an empty page for the filter in flight so the loading state clears,
        // Load more disappears (no stale nextBefore), and the inline error
        // shows instead of a spinner that never resolves.
        if (live) {
          setLoadError(true)
          setLoaded({ group, query: debouncedQuery, rows: [], nextBefore: null })
        }
      })
    return () => {
      live = false
    }
  }, [group, debouncedQuery, fetchPage, loaded.group, loaded.query])

  const loadMore = async () => {
    if (!loaded.nextBefore || loadingMore) return
    // Captured at request time, not read again after the await: if the chip
    // or the settled search term changes while this request is in flight, the
    // main effect above will have already replaced `loaded` with the new
    // filter's first page, and this stale response must not then glue the
    // OLD filter's page two — and its cursor — onto it.
    const requestGroup = group
    const requestQuery = debouncedQuery
    setLoadingMore(true)
    try {
      const data = await fetchPage(requestGroup, requestQuery, loaded.nextBefore)
      setLoaded((prev) => {
        if (prev.group !== requestGroup || prev.query !== requestQuery) return prev
        const seen = new Set(prev.rows.map((r) => r.id))
        return { ...prev, rows: [...prev.rows, ...data.rows.filter((r) => !seen.has(r.id))], nextBefore: data.nextBefore }
      })
    } catch {
      // A failed page leaves the list as it was; the button stays for a retry.
    } finally {
      setLoadingMore(false)
    }
  }

  // The previous page stays on screen while the next one loads — swapping to
  // an empty list on every keystroke or chip tap would flash the empty state
  // between requests. `loading` only holds back Load more and the empty
  // message, which must not claim "no pieces" about a page still in flight.
  const { rows, nextBefore } = loaded

  return (
    <>
      <h1 className="hf-display text-2xl">{t('pieces_title')}</h1>

      <TextField label={t('pieces_search')} value={query} onChange={setQuery} dictate={false} />

      <div role="group" aria-label={t('pieces_title')} className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.group}
            type="button"
            aria-pressed={group === c.group}
            onClick={() => setGroup(c.group)}
            className="hf-ui rounded-full border px-3 py-2 text-xs uppercase"
            style={
              group === c.group
                ? { background: 'var(--hf-ink)', color: 'var(--hf-paper)', borderColor: 'var(--hf-ink)' }
                : { color: 'var(--hf-ink)', borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }
            }
          >
            {t(c.key)}
          </button>
        ))}
      </div>

      {loadError && !loading && (
        <p role="alert" className="text-base font-semibold" style={{ color: 'var(--hf-oxblood-deep)' }}>
          {t('network')}
        </p>
      )}

      {!loading && rows.length === 0 ? (
        <p className="text-lg" style={{ color: 'var(--hf-muted)' }}>
          {t('pieces_empty')}
        </p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((row) => {
            const stage = stageForState(row.state)
            return (
              <li key={row.id}>
                <Link
                  href={`/pieces/${row.id}`}
                  aria-label={`${row.styleCode} ${row.size} · ${row.shade} #${formatSerial(row.serial)}`}
                  className="flex items-center justify-between gap-3 rounded-xl border px-3"
                  style={{ minHeight: '56px', borderColor: 'var(--hf-line)', background: 'var(--hf-card)' }}
                >
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-base font-semibold">
                      {row.styleCode} {row.size} · {row.shade} #{formatSerial(row.serial)}
                    </span>
                    <span className="truncate text-sm" style={{ color: 'var(--hf-muted)' }}>
                      {row.worker ? `${t('with')} ${row.worker}` : t('store_room')} · {formatAge(row.ageMinutes)}
                    </span>
                  </span>
                  <span
                    className="hf-ui shrink-0 rounded px-2 py-1 text-xs uppercase"
                    style={{ background: stageColor(stage), color: stageTextColor(stage) }}
                  >
                    {stateName(row.state, lang)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {nextBefore && !loading && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="hf-ui flex min-h-14 items-center justify-center rounded-lg border-2 px-4 text-base uppercase disabled:opacity-50"
          style={{ borderColor: 'var(--hf-line)', background: 'var(--hf-card)', color: 'var(--hf-ink)' }}
        >
          {t('pieces_load_more')}
        </button>
      )}
    </>
  )
}
