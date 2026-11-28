import { MATCH } from '../../state/matchConfig';

/** Matches the panel offers; any other is written into the URL (see `matchFromQuery`). */
const MATCHES: readonly { name: string; query: string }[] = [
  { name: 'Solo (prototype map)', query: '' },
  { name: '1 v 1', query: '?map=skirmish&teams=1,2' },
  { name: '2 v 2', query: '?map=skirmish&teams=1,2,1,2' },
  { name: '4 players, all against all', query: '?map=skirmish&teams=1,2,3,4' },
];

/** Development only: starts another match by reloading the page with its URL. */
export function DevMatchPicker() {
  return (
    <label className="dev-match">
      Match
      <select
        value={
          MATCHES.some((m) => m.query === window.location.search) ? window.location.search : ''
        }
        onChange={(event) => window.location.assign(window.location.pathname + event.target.value)}
      >
        {MATCHES.map((match) => (
          <option key={match.query} value={match.query}>
            {match.name}
          </option>
        ))}
      </select>
      <small>
        {MATCH.map.name} · {MATCH.setup.seats.length} seat(s)
      </small>
    </label>
  );
}
