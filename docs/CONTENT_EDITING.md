# Editing the Surf Del Mar website

This site is built with **Astro** and deployed on **Netlify**. There are **three** main ways to change content; use the right one for each job.

## 1. Inline editor (homepage and some text)

When you are **logged in as admin** (password in the site’s login flow), many homepage phrases can be edited **directly on the page**. Those elements have internal keys like `data-editable="home.hero.title"`.

- **Where:** Mostly the **home page** (`/`).
- **How:** Log in → click text → save. Changes are stored in **Firebase** so everyone sees them after a refresh.
- **Adding new “boxes”:** Requires a developer to add a new HTML block in `src/pages/index.astro` (or another page) and a new `data-editable="..."` key.

## 2. Decap CMS (`/admin/`)

**URL:** `https://yoursite.netlify.app/admin/` (or your custom domain + `/admin/`).

Uses **`public/admin/config.yml`**. After you save in the CMS, changes are **committed to Git** and Netlify **rebuilds** the site.

| What in CMS | What it controls |
|---------------|------------------|
| **Schedule page → Intro text (above schedule)** | `content/calendar.md` — short intro / notes **above** the interactive schedule on **`/schedule/`**. |
| **Photos** | Entries under `content/photos/` (for anything your site loads from there). |

**Important:** The **full event list** (times, venues, titles) on `/schedule/` is **not** edited in Decap. It is managed by the **schedule tools on `/schedule/`** (admin login) and **Firebase**, plus default data in `src/pages/schedule.astro`.

## 3. Schedule events (Firebase + schedule page)

- **Where:** Go to **`/schedule/`** → use **Edit calendar** (or equivalent) after **admin login**.
- **Persist:** Saves to **Firestore** via **Netlify Functions** (see `README.md` for env vars: `ADMIN_PASSWORD`, `FIREBASE_SERVICE_ACCOUNT`, `PUBLIC_FIREBASE_*`).
- **First-time / fallback:** Default events live in code in `schedule.astro` until you save from the admin UI to seed Firebase.

## Donation link (Zeffy)

- **Homepage:** “Donate with Zeffy” button and **Support** heading/body use `src/config/siteLinks.ts` and the same URL as the footer.
- **Override in production:** Set **`PUBLIC_ZEFFY_DONATION_URL`** in Netlify → Site settings → Environment variables → redeploy.

## Del Mar Historical Society link

- **Header logo** and **footer** text link to **`https://delmarhistoricalsociety.org/`** (defined in `src/config/siteLinks.ts` as `HISTORICAL_SOCIETY_URL`).

## Images

- **Static files:** Put files in **`public/`**, e.g. `public/assets/images/photo.jpg` → use **`/assets/images/photo.jpg`** in HTML or Markdown.
- **Decap uploads:** Use the **`media_folder`** in `public/admin/config.yml` (`public/assets/images`).

## Colors and layout

- **Global theme:** CSS variables in **`src/layouts/BaseLayout.astro`** (e.g. `--color-cream`, `--color-sand-dark`, `--color-ink`).
- **One page only:** Each page’s `<style>` block in `src/pages/....astro`.

## New pages

1. Add **`src/pages/your-page.astro`** with `<BaseLayout title="...">...</BaseLayout>`.
2. Add links in **`src/layouts/BaseLayout.astro`** for both **desktop nav** and the **mobile drawer**.
3. Deploy. URL is usually **`/your-page/`** (folder name from the file path).

## Local Decap (optional)

From the project folder:

```sh
npx decap-server
```

Then open **`http://localhost:8080/admin`** while `npm run dev` is running (see `config.yml` comment).

---

## Extended admin (Firestore `content/siteConfig`)

One document **`content/siteConfig`** holds optional:

| Field | Purpose |
|--------|---------|
| `pageBackgrounds` | Map of **page key → CSS color** (hex). Keys match `pageKey` on each layout or are derived from the URL (e.g. `home`, `schedule`, `p-info` for `/p/info/`). |
| `dynamicBlocks` | Map of **page key → array of blocks** (`text` or `image`, plus `align`: left / right / center). |

- **Page settings:** After admin login, use **Page settings** in the top admin bar to pick a background preset or hex for the **current page**.
- **Dynamic blocks:** On the home page and on `/p/{slug}` CMS routes, use **+ Text** / **+ Image** when logged in. Images upload via the existing Netlify image function (stored as data URLs in Firestore overrides).

**Netlify function:** `/.netlify/functions/save-site-config` (password + `patch` object). Deploy **`save-site-config.js`** with other functions.

## CMS routes (`/p/your-slug`)

- Add slugs to **`PUBLIC_CMS_PAGE_SLUGS`** (comma-separated) in Netlify and **redeploy** so Astro generates each `/p/slug/` page.
- Default build includes at least **`info`** if the env var is unset (see `src/pages/p/[slug].astro`).

## Schedule bulk edit

On **`/schedule/`** (admin): **Export CSV**, **Import CSV** (replaces all events), or paste a **JSON array** of events and **Apply JSON**, then **Save changes** as usual.

---

## Firestore layout (reference)

```
content/
  siteConfig     ← pageBackgrounds, dynamicBlocks, cmsPages (optional future use)
  schedule       ← festival events
  pageText       ← data-editable text overrides
  imageOverrides ← swapped images
```
