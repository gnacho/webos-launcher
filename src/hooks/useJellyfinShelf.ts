import {useEffect, useState} from 'preact/hooks';
import {fetchNextUp, fetchResume, type CwItem, type JellyfinServer} from '../lib/jellyfin';

const REFRESH_MS = 5 * 60 * 1000;

/** One Jellyfin shelf, refreshed every 5 minutes. Keyed on the server, so signing in
 *  again (or changing server) refetches; failures keep the previous shelf on screen. */
function useShelf (server: JellyfinServer | null, load: (server: JellyfinServer) => Promise<CwItem[]>): CwItem[] {
	const [items, setItems] = useState<CwItem[]>([]);
	const key = server ? `${server.url}|${server.userId}` : '';

	useEffect(() => {
		if (!key || !server) { setItems([]); return; }
		let cancelled = false;
		const refresh = () => {
			load(server)
				.then((list) => { if (!cancelled) setItems(list); })
				.catch(() => { /* keep the previous shelf */ });
		};
		refresh();
		const timer = window.setInterval(refresh, REFRESH_MS);
		return () => { cancelled = true; window.clearInterval(timer); };
	}, [key]);

	return items;
}

/** Continue Watching shelf for the configured server. */
export function useJellyfinCw (server: JellyfinServer | null): CwItem[] {
	return useShelf(server, fetchResume);
}

/** Next Up shelf: the next unwatched episode of each started series. */
export function useJellyfinNextUp (server: JellyfinServer | null): CwItem[] {
	return useShelf(server, fetchNextUp);
}
