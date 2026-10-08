import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';
import {useStrings} from '../hooks/useStrings';
import {searchCities, type WeatherCity} from '../lib/weather';

// On-screen keyboard for picking a weather city with the remote. Search is live
// (debounced); Down moves into the results row, OK there picks a city.

const KEY_ROWS: string[][] = [
	['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
	['j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r'],
	['s', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'ñ'],
	[' ', '⌫', '↵']
];

const SPACE = ' ';
const BACKSPACE = '⌫';

interface Props {
	active: boolean;
	onPick: (city: WeatherCity) => void;
	onClose: () => void;
}

export function CitySearch ({active, onPick, onClose}: Props) {
	const s = useStrings();
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<WeatherCity[]>([]);
	const [zone, setZone] = useState<'keys' | 'results'>('keys');
	const [row, setRow] = useState(0);
	const [col, setCol] = useState(0);
	const [resultIndex, setResultIndex] = useState(0);
	const searchTimer = useRef(0);

	// Debounced live search
	useEffect(() => {
		window.clearTimeout(searchTimer.current);
		if (!query.trim()) { setResults([]); return; }
		searchTimer.current = window.setTimeout(() => {
			searchCities(query)
				.then((list) => { setResults(list); setResultIndex(0); })
				.catch(() => setResults([]));
		}, 500);
		return () => window.clearTimeout(searchTimer.current);
	}, [query]);

	const pressKey = (k: string) => {
		if (k === BACKSPACE) setQuery((q) => q.slice(0, -1));
		else if (k === '↵') setZone('results');
		else setQuery((q) => (q + k).slice(0, 32));
	};

	const moveKey = (key: NavKey): boolean => {
		const cols = KEY_ROWS[row].length;
		switch (key) {
			case 'left': setCol((c) => clamp(c - 1, 0, cols - 1)); return true;
			case 'right': setCol((c) => clamp(c + 1, 0, cols - 1)); return true;
			case 'up': setRow((r) => clamp(r - 1, 0, KEY_ROWS.length - 1)); return true;
			case 'down':
				if (row === KEY_ROWS.length - 1 && results.length) { setZone('results'); return true; }
				setRow((r) => clamp(r + 1, 0, KEY_ROWS.length - 1)); return true;
			case 'enter': pressKey(KEY_ROWS[row][col]); return true;
			case 'back': onClose(); return true;
		}
		return false;
	};

	const moveResults = (key: NavKey): boolean => {
		switch (key) {
			case 'left': setResultIndex((i) => clamp(i - 1, 0, results.length - 1)); return true;
			case 'right': setResultIndex((i) => clamp(i + 1, 0, results.length - 1)); return true;
			case 'up': setZone('keys'); return true;
			case 'enter': {
				const city = results[resultIndex];
				if (city) onPick(city);
				return true;
			}
			case 'back': setZone('keys'); return true;
		}
		return false;
	};

	const handleKey = useCallback((key: NavKey): boolean =>
		zone === 'keys' ? moveKey(key) : moveResults(key), [zone, row, col, results, resultIndex, query]);

	useKeys(handleKey, active);

	return (
		<div class="screen screen--overlay">
			<h1 class="search__title">{s.weatherSearchTitle}</h1>
			<div class="search__query">
				{query || <span class="search__placeholder">{s.weatherSearchPlaceholder}</span>}
				<span class="search__cursor">▌</span>
			</div>
			<div class="search__keyboard">
				{KEY_ROWS.map((keys, r) => (
					<div class="search__keyrow" key={r}>
						{keys.map((k, c) => (
							<button
								key={`${r}-${c}`}
								class={`search__key${zone === 'keys' && r === row && c === col ? ' search__key--focused' : ''}`}
								onClick={() => { setRow(r); setCol(c); pressKey(k); }}
								onMouseEnter={() => { setZone('keys'); setRow(r); setCol(c); }}
							>
								{k === SPACE ? '␣' : k}
							</button>
						))}
					</div>
				))}
			</div>
			<div class="search__results">
				{results.length === 0
					? <div class="search__hint">{query.trim() ? s.weatherNoResults : s.weatherSearchHint}</div>
					: results.map((city, i) => (
						<button
							key={`${city.latitude},${city.longitude}`}
							class={`search__result${zone === 'results' && i === resultIndex ? ' search__result--focused' : ''}`}
							onClick={() => onPick(city)}
							onMouseEnter={() => { setZone('results'); setResultIndex(i); }}
						>
							<div class="search__result-name">{city.name}</div>
							<div class="search__result-country">{city.country}</div>
						</button>
					))}
			</div>
		</div>
	);
}
