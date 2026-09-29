/**
 * Shared external URLs (header, footer, homepage donate block).
 * Override the Donate buttons with PUBLIC_ZEFFY_DONATION_URL in Netlify or .env.
 */
export const HISTORICAL_SOCIETY_URL = 'https://delmarhistoricalsociety.org/';

export const AARON_NAYKI_URL = 'https://www.aaronnayki.com';
export const KESHAV_BHASKAR_LINKEDIN_URL = 'https://www.linkedin.com/in/keshav-bhaskar-60a764416';

/** Donations only. Header, footer, and homepage Donate buttons. */
export const ZEFFY_DONATION_URL =
	'https://www.zeffy.com/en-US/donation-form/donate-to-del-mar-historical-society';

/** Zeffy organization page listing every campaign. */
export const ZEFFY_ORG_URL = 'https://www.zeffy.com/en-US/organizations/del-mar-historical-society';

/** Live silent auction. Bidding closes Saturday, October 10, 2026 at 5:30pm. */
export const ZEFFY_SILENT_AUCTION_URL =
	'https://www.zeffy.com/en-US/ticketing/del-mar-historical-societys-silent-auction';

/** Festival posters, T-shirts, and other items for sale. */
export const ZEFFY_SHOP_URL =
	'https://www.zeffy.com/en-US/ticketing/del-mar-historical-societys-shop';

export const SILENT_AUCTION_OPEN_NOTICE =
	'SILENT AUCTION OPEN NOW! Set to close on Saturday, October 10, 2026 at 5:30pm SHARP!';

export function getZeffyDonationUrl(): string {
	const fromEnv = import.meta.env.PUBLIC_ZEFFY_DONATION_URL;
	if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
	return ZEFFY_DONATION_URL;
}
