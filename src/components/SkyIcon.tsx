// Small line icons for the sky conditions, same stroke style as Glyph.tsx.

import type {Sky} from '../lib/weather';

const CLOUD = 'M7 19h9.5a4 4 0 0 0 .7-7.94A5.6 5.6 0 0 0 6.2 11.6 3.6 3.6 0 0 0 7 19Z';
const SUN_RAYS = 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4';

export function SkyIcon ({sky}: {sky: Sky}) {
	return (
		<svg class="weather__icon" viewBox="0 0 24 24" aria-hidden="true">
			{sky === 'clear-day' && <>
				<circle cx="12" cy="12" r="4" />
				<path d={SUN_RAYS} />
			</>}
			{sky === 'clear-night' && <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />}
			{(sky === 'partly' || sky === 'overcast') && <>
				<path d={CLOUD} fill={sky === 'overcast' ? 'currentColor' : 'none'} />
				{sky === 'partly' && <path d="M18 4v2M22 6h-2M19.5 2.5l-1 1" />}
			</>}
			{sky === 'fog' && <path d="M5 10h14M7 14h10M9 18h6" />}
			{sky === 'drizzle' && <>
				<path d={CLOUD} />
				<path d="M9 21v1.5M13 21.5v1.5M17 21v1.5" />
			</>}
			{sky === 'rain' && <>
				<path d={CLOUD} />
				<path d="M9 20.5 8 23M13 20.5 12 23M17 20.5 16 23" />
			</>}
			{sky === 'snow' && <>
				<path d={CLOUD} />
				<circle cx="9" cy="21.5" r="0.8" fill="currentColor" stroke="none" />
				<circle cx="13" cy="22.5" r="0.8" fill="currentColor" stroke="none" />
				<circle cx="17" cy="21.5" r="0.8" fill="currentColor" stroke="none" />
			</>}
			{sky === 'thunder' && <>
				<path d={CLOUD} />
				<path d="M12.5 17 10 21h2.5l-1.5 3.5L16 20h-2.5l1-3z" />
			</>}
		</svg>
	);
}
