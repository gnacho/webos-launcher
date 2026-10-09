import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Home, type HomeRow} from './screens/Home';
import {Settings, type SettingsTab} from './screens/Settings';
import {TextEntry, type TextEntryResult} from './screens/TextEntry';
import type {OptionItem} from './components/OptionList';
import {Toast, type ToastMessage} from './components/Toast';
import type {TileModel} from './components/Tile';
import {useStrings} from './hooks/useStrings';
import {useWeather} from './hooks/useWeather';
import {useJellyfinCw} from './hooks/useJellyfinCw';
import {listApps, readAppCache, writeAppCache, type AppEntry} from './lib/apps';
import {listInputs, MOCK_INPUTS, type InputSource} from './lib/inputs';
import {launchApp, launchLgHome} from './lib/launch';
import {isWebOS} from './lib/luna';
import {hidePointerOnForeground} from './lib/pointer';
import {loadConfig, saveConfig, toggleId, type UserConfig} from './lib/storage';
import {appTile, inputTile, pickInOrder} from './lib/tiles';
import {fill} from './lib/strings';
import type {WeatherCity} from './lib/weather';
import {searchCities} from './lib/weather';
import {authenticate, normalizeUrl, type JellyfinServer} from './lib/jellyfin';
import {BUTACA_APP_ID, TIMING} from './config/constants';

type Screen = 'home' | 'settings';
type Entry = 'weather' | 'jf-url' | 'jf-user' | 'jf-pass' | null;

const ROW = {cw: 'cw', apps: 'apps', sources: 'sources', misc: 'misc'} as const;
const MISC = {lgHome: 'lg-home', settings: 'settings'} as const;
const OPTION = {useHomebrew: 'use-homebrew', weather: 'weather', jellyfin: 'jellyfin'} as const;

export function App () {
	const s = useStrings();
	const [screen, setScreen] = useState<Screen>('home');
	const [entry, setEntry] = useState<Entry>(null);
	const [config, setConfig] = useState<UserConfig>(loadConfig);
	// Show the previous run's app list instantly; the background refresh below
	// replaces it once the per-app luna round-trips resolve.
	const [apps, setApps] = useState<AppEntry[]>(readAppCache);
	const [inputs, setInputs] = useState<InputSource[]>([]);
	const [jfDraft, setJfDraft] = useState<{url?: string; user?: string}>({});
	const weather = useWeather(config.weatherCity);
	const cw = useJellyfinCw(config.jellyfin);
	const [toast, setToast] = useState<ToastMessage | null>(null);
	const toastTimer = useRef(0);

	const miscTiles: TileModel[] = useMemo(() => [
		{key: MISC.lgHome, label: s.lgHome, glyph: 'house'},
		{key: MISC.settings, label: s.settings, glyph: 'gear'}
	], [s]);

	const showToast = useCallback((text: string, kind: ToastMessage['kind'] = 'info') => {
		window.clearTimeout(toastTimer.current);
		setToast({text, kind});
		toastTimer.current = window.setTimeout(() => setToast(null), TIMING.toastMs);
	}, []);

	// Start in remote (5-way) mode: hide the Magic Remote pointer whenever we come to the
	// front. Shaking the remote still brings it back.
	useEffect(() => hidePointerOnForeground(), []);

	// Load apps at start and whenever the Homebrew option changes; refresh inputs whenever
	// the app comes back to the foreground (labels or connections may have changed).
	useEffect(() => {
		listApps(config.useHomebrew)
			.then(({apps: list, source}) => {
				setApps(list);
				if (source === 'catalog') writeAppCache(list);
				if (config.useHomebrew && source !== 'homebrew') showToast(s.toastHomebrewUnavailable, 'error');
			})
			.catch(() => showToast(s.toastAppListFailed, 'error'));
	}, [config.useHomebrew, showToast, s]);

	useEffect(() => {
		const refresh = () => {
			if (!isWebOS()) { setInputs(MOCK_INPUTS); return; }
			listInputs(s.liveTv).then(setInputs).catch(() => showToast(s.toastInputsFailed, 'error'));
		};
		refresh();
		const onVisibility = () => { if (!document.hidden) refresh(); };
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	}, [showToast, s]);

	const updateConfig = (next: UserConfig) => { setConfig(next); saveConfig(next); };

	// ----- derived rows -----
	const shownApps = useMemo(() => pickInOrder(apps, config.appIds, (a) => a.id), [apps, config.appIds]);
	const shownInputs = useMemo(
		() => (config.sourceIds ? pickInOrder(inputs, config.sourceIds, (s) => s.appId) : inputs),
		[inputs, config.sourceIds]
	);

	const cwItems: TileModel[] = useMemo(() => cw.map((item) => ({
		key: item.id,
		label: item.seriesName ? `${item.seriesName}: ${item.label}` : item.label,
		imageUrl: item.imageUrl
	})), [cw]);

	const rows: HomeRow[] = useMemo(() => {
		const list: HomeRow[] = [];
		if (cwItems.length) list.push({id: ROW.cw, label: s.rowContinueWatching, items: cwItems});
		list.push(
			{id: ROW.apps, label: s.rowApps, items: shownApps.map(appTile), emptyText: s.emptyApps},
			{id: ROW.sources, label: s.rowSources, items: shownInputs.map(inputTile), emptyText: s.emptySources},
			{id: ROW.misc, label: s.rowMore, items: miscTiles}
		);
		return list;
	}, [cwItems, shownApps, shownInputs, miscTiles, s]);

	const tabs: SettingsTab[] = useMemo(() => [
		{id: ROW.apps, label: s.tabApps, noun: s.nounApps, items: apps.map(appTile), shown: shownApps.map(appTile)},
		{id: ROW.sources, label: s.tabSources, noun: s.nounSources, items: inputs.map(inputTile), shown: shownInputs.map(inputTile)}
	], [apps, inputs, shownApps, shownInputs, s]);

	const options: OptionItem[] = useMemo(() => [
		{
			id: OPTION.useHomebrew,
			label: s.optionUseHomebrew,
			description: s.optionUseHomebrewDesc,
			value: config.useHomebrew
		},
		{
			id: OPTION.weather,
			label: s.optionWeather,
			description: s.optionWeatherDesc,
			value: config.weatherCity != null,
			text: config.weatherCity ? config.weatherCity.name : s.weatherNoCity
		},
		{
			id: OPTION.jellyfin,
			label: s.optionJellyfin,
			description: s.optionJellyfinDesc,
			value: config.jellyfin != null,
			text: config.jellyfin ? `${config.jellyfin.userName} @ ${config.jellyfin.url.replace(/^https?:\/\//, '')}` : s.jellyfinNotSet
		}
	], [config.useHomebrew, config.weatherCity, config.jellyfin, s]);

	// ----- actions -----
	const open = (id: string, label: string, params?: object) => {
		launchApp(id, params || {}).catch(() => showToast(fill(s.toastOpenFailed, {label}), 'error'));
	};

	const onActivate = useCallback((rowId: string, item: TileModel) => {
		if (rowId === ROW.misc) {
			if (item.key === MISC.settings) setScreen('settings');
			else if (item.key === MISC.lgHome) launchLgHome().catch(() => showToast(s.toastLgHomeFailed, 'error'));
			return;
		}
		if (rowId === ROW.cw) {
			open(BUTACA_APP_ID, item.label, {jellyfinItemId: item.key});
			return;
		}
		open(item.key, item.label);
	}, [showToast, s]);

	const onToggle = useCallback((tabId: string, key: string) => {
		if (tabId === ROW.apps) {
			updateConfig({...config, appIds: toggleId(config.appIds, key)});
		} else {
			const current = config.sourceIds || inputs.map((s) => s.appId);
			updateConfig({...config, sourceIds: toggleId(current, key)});
		}
	}, [config, inputs]);

	const onOption = useCallback((optionId: string) => {
		if (optionId === OPTION.useHomebrew) updateConfig({...config, useHomebrew: !config.useHomebrew});
		else if (optionId === OPTION.weather) setEntry('weather');
		else if (optionId === OPTION.jellyfin) {
			setJfDraft({});
			setEntry('jf-url');
		}
	}, [config]);

	// ----- text entry flows -----
	const cityProvider = useCallback((q: string) =>
		searchCities(q).then((cities) => cities.map((c) => ({
			id: `${c.latitude},${c.longitude}`,
			label: c.name,
			sub: c.country
		}))), []);

	const onPickCity = useCallback((result: TextEntryResult) => {
		const [lat, lon] = result.id.split(',').map(Number);
		const city: WeatherCity = {name: result.label, country: result.sub || '', latitude: lat, longitude: lon};
		updateConfig({...config, weatherCity: city});
		setEntry(null);
		setScreen('settings');
	}, [config]);

	const onPickJfUrl = useCallback((result: TextEntryResult) => {
		setJfDraft((d) => ({...d, url: normalizeUrl(result.id)}));
		setEntry('jf-user');
	}, []);

	const finishJf = useCallback((server: JellyfinServer) => {
		updateConfig({...config, jellyfin: server});
		setEntry(null);
		setScreen('settings');
	}, [config]);

	const onPickJfUser = useCallback((result: TextEntryResult) => {
		setJfDraft((d) => ({...d, user: result.id.trim()}));
		setEntry('jf-pass');
	}, []);

	const onPickJfPass = useCallback((result: TextEntryResult) => {
		const {url, user} = jfDraft;
		if (!url || !user) { setEntry('jf-url'); return; }
		showToast(s.jfChecking, 'info');
		authenticate(url, user, result.id)
			.then(finishJf)
			.catch(() => showToast(s.toastJfFailed, 'error'));
	}, [jfDraft, config, s, finishJf]);

	/** Replace a row's order with `keys` (the full list of what's shown). */
	const onReorder = useCallback((tabId: string, keys: string[]) => {
		if (tabId === ROW.apps) updateConfig({...config, appIds: keys});
		else updateConfig({...config, sourceIds: keys});
	}, [config]);

	const entryScreen = (() => {
		switch (entry) {
			case 'weather':
				return <TextEntry active title={s.weatherSearchTitle} placeholder={s.weatherSearchPlaceholder}
					hint={s.weatherSearchHint} provider={cityProvider} onPick={onPickCity} onClose={() => setEntry(null)} />;
			case 'jf-url':
				return <TextEntry active title={s.jfUrlTitle} placeholder={s.jfUrlPlaceholder}
					hint={s.jfChecking} onPick={onPickJfUrl} onClose={() => setEntry(null)} />;
			case 'jf-user':
				return <TextEntry active title={s.jfUserTitle} placeholder={s.jfUserPlaceholder}
					hint={s.jfChecking} onPick={onPickJfUser} onClose={() => setEntry('jf-url')} />;
			case 'jf-pass':
				return <TextEntry active title={s.jfPassTitle} placeholder={s.jfPassPlaceholder}
					hint={s.jfChecking} onPick={onPickJfPass} onClose={() => setEntry('jf-user')} />;
			default:
				return null;
		}
	})();

	return (
		<>
			{/* Home stays mounted under Settings so it keeps its focus position. */}
			<Home rows={rows} active={screen === 'home' && entry === null} weather={weather} weatherCity={config.weatherCity} onActivate={onActivate} />
			{screen === 'settings' && !entry && <Settings tabs={tabs} options={options} active onToggle={onToggle} onReorder={onReorder} onOption={onOption} onClose={() => setScreen('home')} />}
			{entryScreen}
			<Toast message={toast} />
		</>
	);
}
