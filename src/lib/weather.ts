// Weather data from Open-Meteo (https://open-meteo.com): free for non-commercial
// use, no API key, CORS-enabled. A web app on the TV can call it directly.

export interface WeatherCity {
	name: string;
	country: string;
	latitude: number;
	longitude: number;
}

export interface WeatherInfo {
	tempC: number;
	/** WMO weather interpretation code */
	code: number;
	isDay: boolean;
}

/** Normalised sky condition for icon selection. */
export type Sky =
	'clear-day' | 'clear-night' | 'partly' | 'overcast' |
	'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder';

export function skyOf (code: number, isDay: boolean): Sky {
	if (code === 0 || code === 1) return isDay ? 'clear-day' : 'clear-night';
	if (code === 2) return 'partly';
	if (code === 3) return 'overcast';
	if (code === 45 || code === 48) return 'fog';
	if (code >= 51 && code <= 57) return 'drizzle';
	if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
	if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
	return 'thunder';           // 95, 96, 99
}

function getJson (url: string): Promise<unknown> {
	return fetch(url).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		return r.json();
	});
}

export function searchCities (query: string): Promise<WeatherCity[]> {
	const q = encodeURIComponent(query.trim());
	return getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=5&language=en&format=json`)
		.then((data) => {
			const results = (data as {results?: Array<{name: string; country?: string; latitude: number; longitude: number}>}).results || [];
			return results.map((r) => ({name: r.name, country: r.country || '', latitude: r.latitude, longitude: r.longitude}));
		});
}

export function fetchWeather (city: WeatherCity): Promise<WeatherInfo> {
	const url = 'https://api.open-meteo.com/v1/forecast'
		+ `?latitude=${city.latitude}&longitude=${city.longitude}`
		+ '&current_weather=true&timezone=auto';
	return getJson(url).then((data) => {
		const cw = (data as {current_weather?: {temperature: number; weathercode: number; is_day: number}}).current_weather;
		if (!cw) throw new Error('no current_weather');
		return {tempC: Math.round(cw.temperature), code: cw.weathercode, isDay: cw.is_day === 1};
	});
}
