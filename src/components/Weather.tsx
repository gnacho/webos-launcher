import {SkyIcon} from './SkyIcon';
import {skyOf, type WeatherCity, type WeatherInfo} from '../lib/weather';

/** Weather line shown at the top-left of the home screen, next to the clock. */
export function Weather ({info, city}: {info: WeatherInfo | null; city: WeatherCity | null}) {
	if (!info || !city) return null;
	return (
		<div class="weather">
			<SkyIcon sky={skyOf(info.code, info.isDay)} />
			<span class="weather__temp">{info.tempC}°</span>
			<span class="weather__city">{city.name}</span>
		</div>
	);
}
