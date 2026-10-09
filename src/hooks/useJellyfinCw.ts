import {useEffect, useState} from 'preact/hooks';
import {fetchResume, type CwItem, type JellyfinServer} from '../lib/jellyfin';

const REFRESH_MS = 5 * 60 * 1000;

/** Continue Watching shelf for the configured server, refreshed every 5 minutes. */
export function useJellyfinCw (server: JellyfinServer | null): CwItem[] {
	const [items, setItems] = useState<CwItem[]>([]);
	const key = server ? `${server.url}|${server.userId}` : '';

	useEffect(() => {
		if (!key || !server) { setItems([]); return; }
		let cancelled = false;
		const load = () => {
			fetchResume(server)
				.then((list) => { if (!cancelled) setItems(list); })
				.catch(() => { /* keep the previous shelf */ });
		};
		load();
		const timer = window.setInterval(load, REFRESH_MS);
		return () => { cancelled = true; window.clearInterval(timer); };
	}, [key]);

	return items;
}
