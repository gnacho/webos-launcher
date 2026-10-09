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

interface ResumeItem {
	Id?: string;
	Name?: string;
	SeriesName?: string;
	ImageTags?: {Primary?: string};
}

/** The signed-in user's Continue Watching shelf, as tile-ready entries. */
export function fetchResume (server: JellyfinServer, limit = 12): Promise<CwItem[]> {
	const fields = encodeURIComponent('ImageTags');
	const url = `${server.url}/Users/${server.userId}/Items/Resume`
		+ `?Limit=${limit}&Fields=${fields}&ImageTypeLimit=1&EnableTotalRecordCount=false`;
	return getJson(url, server.token).then((data) => {
		const items = (data as {Items?: ResumeItem[]}).Items || [];
		return items
			.filter((i) => i.Id && i.Name)
			.map((i) => ({
				id: i.Id as string,
				label: i.Name as string,
				seriesName: i.SeriesName || undefined,
				imageUrl: i.ImageTags && i.ImageTags.Primary
					? `${server.url}/Items/${i.Id}/Images/Primary?maxWidth=288&maxHeight=432&quality=85&api_key=${server.token}`
					: undefined
			}));
	});
}
