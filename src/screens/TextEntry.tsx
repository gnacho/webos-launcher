import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {useKeys, clamp, type NavKey} from '../hooks/useKeys';

// On-screen keyboard text entry for the remote. With a `provider` the screen is a live
// search (debounced results, Down moves into the results row); without one, the ↵ key (or
// the ✓ tile) submits the typed text itself. The keyboard carries digits and the symbols a
// server URL / API key needs, so one screen serves cities and server setup alike.

export interface TextEntryResult {id: string; label: string; sub?: string}

const KEY_ROWS: string[][] = [
	['1', '2', '3', '4', '5', '6', '7', '8', '9'],
	['0', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
	['i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q'],
	['r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'],
	['⇧', ':', '/', '.', '-', '_', '@', ' ', '⌫', '↵']
];

const SPACE = ' ';
const BACKSPACE = '⌫';
const SUBMIT = '↵';
const SHIFT = '⇧';

interface Props {
	active: boolean;
	title: string;
	placeholder: string;
	hint?: string;
	/** live results; omit for plain text entry, where ↵ submits the typed text */
	provider?: (query: string) => Promise<TextEntryResult[]>;
	onPick: (result: TextEntryResult) => void;
	onClose: () => void;
}

export function TextEntry ({active, title, placeholder, hint, provider, onPick, onClose}: Props) {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<TextEntryResult[]>([]);
	const [zone, setZone] = useState<'keys' | 'results'>('keys');
	const [row, setRow] = useState(1);             // skip the digit row for plain text entry
	const [col, setCol] = useState(0);
	const [resultIndex, setResultIndex] = useState(0);
	const [upper, setUpper] = useState(false);
	const searchTimer = useRef(0);

	// Debounced live search (only when a provider exists)
	useEffect(() => {
		if (!provider) { setResults([]); return; }
		window.clearTimeout(searchTimer.current);
		if (!query.trim()) { setResults([]); return; }
		searchTimer.current = window.setTimeout(() => {
			provider(query)
				.then((list) => { setResults(list); setResultIndex(0); })
				.catch(() => setResults([]));
		}, 500);
		return () => window.clearTimeout(searchTimer.current);
	}, [query, provider]);

	const submit = () => {
		const text = query.trim();
		if (!text) return;
		if (provider) setZone('results');
		else onPick({id: text, label: text});
	};

	const pressKey = (k: string) => {
		if (k === BACKSPACE) setQuery((q) => q.slice(0, -1));
		else if (k === SUBMIT) submit();
		else if (k === SHIFT) setUpper((u) => !u);
		else setQuery((q) => (q + (upper ? k.toUpperCase() : k)).slice(0, 128));
	};

	const moveKey = (key: NavKey): boolean => {
		const cols = KEY_ROWS[row].length;
		switch (key) {
			case 'left': setCol((c) => clamp(c - 1, 0, cols - 1)); return true;
			case 'right': setCol((c) => clamp(c + 1, 0, cols - 1)); return true;
			case 'up': setRow((r) => clamp(r - 1, 0, KEY_ROWS.length - 1)); return true;
			case 'down':
				if (provider && row === KEY_ROWS.length - 1 && results.length) { setZone('results'); return true; }
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
				const result = results[resultIndex];
				if (result) onPick(result);
				return true;
			}
			case 'back': setZone('keys'); return true;
		}
		return false;
	};

	const handleKey = useCallback((key: NavKey): boolean =>
		zone === 'keys' ? moveKey(key) : moveResults(key), [zone, row, col, results, resultIndex, query, provider]);

	useKeys(handleKey, active);

	return (
		<div class="screen screen--overlay">
			<h1 class="search__title">{title}</h1>
			<div class="search__query">
				{query || <span class="search__placeholder">{placeholder}</span>}
				<span class="search__cursor">▌</span>
			</div>
			<div class="search__keyboard">
				{KEY_ROWS.map((keys, r) => (
					<div class="search__keyrow" key={r}>
						{keys.map((k, c) => (
							<button
								key={`${r}-${c}`}
								class={`search__key${zone === 'keys' && r === row && c === col ? ' search__key--focused' : ''}`}
								onClick={() => { setZone('keys'); setRow(r); setCol(c); pressKey(k); }}
								onMouseEnter={() => { setZone('keys'); setRow(r); setCol(c); }}
							>
								{k === SPACE ? '␣' : k === SHIFT ? (upper ? '⇩' : '⇧') : upper && k >= 'a' && k <= 'z' ? k.toUpperCase() : k}
							</button>
						))}
					</div>
				))}
			</div>
			<div class="search__results">
				{provider
					? (results.length === 0
						? <div class="search__hint">{query.trim() ? (hint ?? '') : (hint ?? '')}</div>
						: results.map((result, i) => (
							<button
								key={result.id}
								class={`search__result${zone === 'results' && i === resultIndex ? ' search__result--focused' : ''}`}
								onClick={() => onPick(result)}
								onMouseEnter={() => { setZone('results'); setResultIndex(i); }}
							>
								<div class="search__result-name">{result.label}</div>
								{result.sub && <div class="search__result-country">{result.sub}</div>}
							</button>
						)))
					: <div class="search__hint">{hint ?? ''}</div>}
			</div>
		</div>
	);
}
