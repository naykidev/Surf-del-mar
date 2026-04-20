/**
 * Parse JSON from a fetch Response body.
 * Safari throws DOMException "The string did not match the expected pattern"
 * when calling response.json() on HTML or non-JSON bodies (e.g. Netlify 404/502 pages).
 */
export async function readResponseJson<T = unknown>(
	res: Response
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
	const text = await res.text();
	if (res.status === 404) {
		return {
			ok: false,
			message:
				'Not found (404). Use `npm run dev` (Netlify Dev), then open the URL Netlify prints (often http://localhost:8888)—not the raw Astro port. Plain `astro dev` does not serve /.netlify/functions/. On production, redeploy so functions are included.',
		};
	}
	if (!text.trim()) {
		return { ok: false, message: `Empty response (HTTP ${res.status}).` };
	}
	try {
		return { ok: true, data: JSON.parse(text) as T };
	} catch {
		return {
			ok: false,
			message: `Invalid response (HTTP ${res.status}). The server may have returned HTML instead of JSON — use Netlify Dev locally (\`npm run dev\`) or check that functions deployed.`,
		};
	}
}
