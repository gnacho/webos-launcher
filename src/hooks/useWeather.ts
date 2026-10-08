import {useEffect, useState} from 'preact/hooks';
import {fetchWeather, type WeatherCity, type WeatherInfo} from '../lib/weather';

const REFRESH_MS = 10 * 60 * 1000;

/** Current weather for a city, refreshed every 10 minutes. Null city → null info. */
export function useWeather (city: WeatherCity | null): WeatherInfo | null {
	const [info, setInfo] = useState<WeatherInfo | null>(null);
	const key = city ? `${city.latitude},${city.longitude}` : '';

	useEffect(() => {
		if (!key || !city) { setInfo(null); return; }
		let cancelled = false;
		const load = () => {
			fetchWeather(city)
				.then((i) => { if (!cancelled) setInfo(i); })
				.catch(() => { /* keep the previous reading */ });
		};
		load();
		const timer = window.setInterval(load, REFRESH_MS);
		return () => { cancelled = true; window.clearInterval(timer); };
	}, [key]);

	return info;
}
