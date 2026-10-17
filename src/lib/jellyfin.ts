// Tiny Jellyfin API client for the Continue Watching row. Auth is the household
// user's own credentials (Jellyfin 12 removed the old /ApiKeys surface, and a user
// token needs no admin and no dashboard trip). The token is stored in the launcher
// config exactly like Butaca stores its own Jellyfin login.

export interface JellyfinServer {
	url: string;
	token: string;
	userId: string;
	userName: string;
}

export interface CwItem {
	id: string;
	label: string;
	seriesName?: string;
	imageUrl?: string;
}

/** Accept "host:port" or "host" and normalise to a base URL without a trailing slash. */
export function normalizeUrl (raw: string): string {
	let u = raw.trim();
	if (!u) return u;
	if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
	return u.replace(/\/+$/, '');
}

function identity (token?: string): string {
	const base = 'MediaBrowser Client="webos-launcher", Device="launcher", DeviceId="webos-launcher", Version="1.0.0"';
	return token ? `${base}, Token="${token}"` : base;
}

function postJson (url: string, body: object, token?: string): Promise<unknown> {
	return fetch(url, {
		method: 'POST',
		headers: {
			Authorization: identity(token),
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	}).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		return r.json();
	});
}

function getJson (url: string, token: string): Promise<unknown> {
	return fetch(url, {headers: {Authorization: identity(token)}}).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		return r.json();
	});
}

/** Sign in; throws on wrong credentials or an unreachable server. */
export function authenticate (url: string, username: string, password: string): Promise<JellyfinServer> {
	return postJson(`${url}/Users/AuthenticateByName`, {Username: username, Pw: password})
		.then((data) => {
			const d = data as {AccessToken?: string; User?: {Id?: string; Name?: string}};
			if (!d.AccessToken || !d.User || !d.User.Id) throw new Error('no session');
			return {url, token: d.AccessToken, userId: d.User.Id, userName: d.User.Name || username};
		});
}

interface ShelfItem {
	Id?: string;
	Name?: string;
	SeriesName?: string;
	SeriesId?: string;
	ImageTags?: {Primary?: string};
	SeriesPrimaryImageTag?: string;
}

/** Fields the shelf endpoints must return for a tile to get its poster (see `posterUrl`). */
const SHELF_FIELDS = 'ImageTags,SeriesPrimaryImageTag';

/** Poster for a shelf tile. An episode's own primary image is a 16:9 still, which looks
 *  wrong in a portrait tile, so episodes use their series poster when there is one. */
function posterUrl (server: JellyfinServer, item: ShelfItem): string | undefined {
	const own = item.ImageTags && item.ImageTags.Primary ? `${server.url}/Items/${item.Id}/Images/Primary` : null;
	const series = item.SeriesId && item.SeriesPrimaryImageTag
		? `${server.url}/Items/${item.SeriesId}/Images/Primary`
		: null;
	const base = series || own;
	return base ? `${base}?maxWidth=288&maxHeight=432&quality=85&api_key=${server.token}` : undefined;
}

function toShelf (server: JellyfinServer, items: ShelfItem[]): CwItem[] {
	return items
		.filter((i) => i.Id && i.Name)
		.map((i) => ({
			id: i.Id as string,
			label: i.Name as string,
			seriesName: i.SeriesName || undefined,
			imageUrl: posterUrl(server, i)
		}));
}

/** The signed-in user's Continue Watching shelf, as tile-ready entries. */
export function fetchResume (server: JellyfinServer, limit = 12): Promise<CwItem[]> {
	const url = `${server.url}/Users/${server.userId}/Items/Resume`
		+ `?Limit=${limit}&Fields=${SHELF_FIELDS}&ImageTypeLimit=1&EnableTotalRecordCount=false`;
	return getJson(url, server.token).then((data) => toShelf(server, (data as {Items?: ShelfItem[]}).Items || []));
}

/** Next Up: the next unwatched episode of every series the user has started. */
export function fetchNextUp (server: JellyfinServer, limit = 12): Promise<CwItem[]> {
	const url = `${server.url}/Shows/NextUp`
		+ `?UserId=${server.userId}&Limit=${limit}&Fields=${SHELF_FIELDS}&ImageTypeLimit=1&EnableTotalRecordCount=false`;
	return getJson(url, server.token).then((data) => toShelf(server, (data as {Items?: ShelfItem[]}).Items || []));
}

// ---------- LAN autodiscovery ----------
//
// A web app cannot do SSDP (no raw UDP), but the common Jellyfin setup answers an
// unauthenticated GET on /System/Info/Public. So: learn the TV's own /24 (WebRTC host
// candidate leaks the local address without STUN), probe every address on port 8096 with
// short timeouts, and keep the ones whose payload names Jellyfin. ~254 requests over a
// wired LAN finish in a few seconds.

/** The TV's /24 prefix ("192.168.1"), via a WebRTC host candidate; "192.168.1" as fallback. */
export function localSubnet (): Promise<string> {
	return new Promise((resolve) => {
		let settled = false;
		const done = (prefix: string) => { if (!settled) { settled = true; resolve(prefix); } };
		const fallback = setTimeout(() => done('192.168.1'), 2000);
		try {
			const pc = new RTCPeerConnection({iceServers: []});
			pc.createDataChannel('discover');
			pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(() => { /* fallthrough */ });
			pc.onicecandidate = (e) => {
				if (settled) return;
				const ips = (e.candidate && e.candidate.candidate.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g)) || [];
				const local = ips.find((ip) => ip.indexOf('127.') !== 0 && ip.indexOf('0.0.0.0') !== 0);
				if (local) {
					clearTimeout(fallback);
					try { pc.close(); } catch { /* already closed */ }
					done(local.split('.').slice(0, 3).join('.'));
				}
			};
		} catch {
			clearTimeout(fallback);
			done('192.168.1');
		}
	});
}

/** Probe `<prefix>.1-254:8096` for a Jellyfin server; reports partial results as they land. */
export function discoverServers (onFound: (urls: string[]) => void, timeoutMs = 9000): Promise<string[]> {
	return localSubnet().then((prefix) => new Promise<string[]>((resolve) => {
		const found: string[] = [];
		const total = 254;
		let started = 0;
		let finished = 0;
		let done = false;

		const finish = () => {
			if (done) return;
			done = true;
			const list = found.slice();
			onFound(list);
			resolve(list);
		};
		const timer = setTimeout(finish, timeoutMs);

		// Keep up to 32 probes in flight: each completion pulls the next address, so the
		// whole /24 is covered in ~8 waves instead of stopping at the first 32.
		const pump = () => {
			while (!done && started < total && started - finished < 32) probe(++started);
		};
		const probe = (n: number) => {
			const base = `http://${prefix}.${n}:8096`;
			const ctl = new AbortController();
			const abort = setTimeout(() => ctl.abort(), 700);
			fetch(`${base}/System/Info/Public`, {signal: ctl.signal})
				.then((r) => (r.ok ? r.json() : null))
				.then((info) => {
					const name = info && (info as {ProductName?: unknown}).ProductName;
					if (typeof name === 'string' && name.indexOf('Jellyfin') !== -1 && found.indexOf(base) === -1) {
						found.push(base);
						onFound(found.slice());
					}
				})
				.catch(() => { /* nothing on this address */ })
				.then(() => {
					clearTimeout(abort);
					finished++;
					if (finished >= total) { clearTimeout(timer); finish(); }
					else pump();
				});
		};
		pump();
	}));
}
