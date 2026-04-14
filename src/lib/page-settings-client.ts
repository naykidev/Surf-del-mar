/**
 * Page background from Firestore siteConfig.pageBackgrounds[pageKey] + modal to edit (admin).
 */
import { getSiteConfig } from './firebase';

const SAVE_URL = '/.netlify/functions/save-site-config';

const PRESETS: { label: string; value: string }[] = [
	{ label: 'Default (cream)', value: '' },
	{ label: 'Sand', value: '#cce4e8' },
	{ label: 'Foam', value: '#b8dce4' },
	{ label: 'White', value: '#ffffff' },
	{ label: 'Warm paper', value: '#fdfaf6' },
	{ label: 'Sea teal', value: '#dbeafe' },
];

function adminPassword(): string {
	return (
		(typeof import.meta.env.PUBLIC_ADMIN_PASSWORD === 'string' && import.meta.env.PUBLIC_ADMIN_PASSWORD) || 'surfdelmar'
	);
}

export function pathnameToPageKey(pathname: string): string {
	const p = pathname.replace(/\/$/, '') || '/';
	if (p === '/') return 'home';
	if (p.startsWith('/p/')) {
		const slug = p.slice(3).replace(/\//g, '-') || 'page';
		return `p-${slug}`;
	}
	return p.replace(/^\//, '').replace(/\//g, '-') || 'home';
}

export async function applyPageBackground(pageKey: string): Promise<void> {
	const cfg = await getSiteConfig();
	const hex = cfg?.pageBackgrounds?.[pageKey];
	if (hex && typeof hex === 'string' && hex.trim()) {
		document.body.style.backgroundColor = hex.trim();
		document.body.dataset.pageBg = 'custom';
	} else {
		document.body.style.backgroundColor = '';
		document.body.dataset.pageBg = '';
	}
}

export function initPageSettingsModal(pageKey: string): void {
	const modal = document.getElementById('page-settings-modal');
	const openBtn = document.getElementById('admin-page-settings-btn');
	const closeBtn = document.getElementById('page-settings-close');
	const saveBtn = document.getElementById('page-settings-save');
	const customInput = document.getElementById('page-settings-custom') as HTMLInputElement | null;
	const presetWrap = document.getElementById('page-settings-presets');

	if (!modal || !openBtn || !presetWrap) return;

	let selectedHex = '';

	function open() {
		modal.hidden = false;
		getSiteConfig().then((cfg) => {
			selectedHex = cfg?.pageBackgrounds?.[pageKey] ?? '';
			if (customInput) customInput.value = selectedHex.startsWith('#') ? selectedHex : '';
		});
	}
	function close() {
		modal.hidden = true;
	}

	openBtn.addEventListener('click', () => {
		if (sessionStorage.getItem('admin') !== 'true') return;
		open();
	});
	closeBtn?.addEventListener('click', close);
	modal.querySelector('.page-settings-overlay')?.addEventListener('click', close);

	presetWrap.innerHTML = '';
	for (const pr of PRESETS) {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'page-settings-preset';
		b.textContent = pr.label;
		b.dataset.hex = pr.value;
		if (!pr.value) b.classList.add('page-settings-preset--default');
		b.style.background = pr.value || 'var(--color-cream)';
		b.addEventListener('click', () => {
			selectedHex = pr.value;
			if (customInput) customInput.value = pr.value;
		});
		presetWrap.appendChild(b);
	}

	saveBtn?.addEventListener('click', async () => {
		const hex = (customInput?.value || '').trim() || selectedHex;
		try {
			const res = await fetch(SAVE_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					password: adminPassword(),
					patch: { pageBackgrounds: { [pageKey]: hex } },
				}),
			});
			const data = (await res.json()) as { ok?: boolean; error?: string };
			if (res.ok && data.ok) {
				document.body.style.backgroundColor = hex || '';
				window.showAdminToast?.('Page background saved.');
				close();
			} else {
				alert(data.error || 'Save failed');
			}
		} catch (e) {
			alert('Save failed: ' + (e instanceof Error ? e.message : String(e)));
		}
	});
}
