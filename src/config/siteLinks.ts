/**
 * Shared external URLs (header, footer, homepage donate block).
 * Override Zeffy with PUBLIC_ZEFFY_DONATION_URL in Netlify or .env.
 */
export const HISTORICAL_SOCIETY_URL = 'https://delmarhistoricalsociety.org/';

export const ACCESSIBILITY_SURFER_EXTENSION_URL =
	'https://chromewebstore.google.com/detail/accessibility-surfer/pccmbliammnfaklpblehkonmhcdnedhn';

const ZEFFY_FALLBACK = 'https://www.zeffy.com/en-US/ticketing/del-mar-surf-reunion';

export function getZeffyDonationUrl(): string {
	const fromEnv = import.meta.env.PUBLIC_ZEFFY_DONATION_URL;
	if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
	return ZEFFY_FALLBACK;
}
