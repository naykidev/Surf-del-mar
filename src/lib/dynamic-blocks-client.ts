/**
 * Client: render dynamic blocks for a page + admin add/remove/upload.
 */
import { getSiteConfig } from './firebase';
import { readResponseJson } from './read-response-json';
import type { DynamicBlock, DynamicBlockAlign } from './site-config-types';

const SAVE_URL = '/.netlify/functions/save-site-config';
const UPLOAD_URL = '/.netlify/functions/upload-image';

/** In-memory cache per page after load/save */
const blockState: Record<string, DynamicBlock[]> = {};

function adminPassword(): string {
  return (
    (typeof import.meta.env.PUBLIC_ADMIN_PASSWORD === 'string' && import.meta.env.PUBLIC_ADMIN_PASSWORD) || 'surfdelmar'
  );
}

function isAdmin(): boolean {
  return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('admin') === 'true';
}

function makeId(): string {
  return `blk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function saveBlocks(pageKey: string, blocks: DynamicBlock[]): Promise<boolean> {
  try {
    const res = await fetch(SAVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: adminPassword(),
        patch: { dynamicBlocks: { [pageKey]: blocks } },
      }),
    });
    const parsed = await readResponseJson<{ ok?: boolean; error?: string }>(res);
    if (!parsed.ok) {
      alert('Save failed: ' + parsed.message);
      return false;
    }
    const data = parsed.data;
    if (res.ok && data.ok) {
      blockState[pageKey] = blocks;
      window.showAdminToast?.('Blocks saved.');
      return true;
    }
    alert(data.error || 'Save failed');
    return false;
  } catch (e) {
    alert('Save failed: ' + (e instanceof Error ? e.message : String(e)));
    return false;
  }
}

function renderMount(mount: HTMLElement, pageKey: string, admin: boolean): void {
  const blocks = blockState[pageKey] ?? [];
  const wrap = document.createElement('div');
  wrap.className = 'dynamic-blocks-list';
  for (const b of blocks) {
    const row = document.createElement('div');
    row.className = `dynamic-block dynamic-block--${b.type} dynamic-block--align-${b.align}`;
    row.dataset.blockId = b.id;
    if (b.type === 'text') {
      const p = document.createElement('div');
      p.className = 'dynamic-block-text';
      p.innerHTML = escapeHtml(b.text || '').replace(/\n/g, '<br />');
      row.appendChild(p);
    } else {
      const fig = document.createElement('figure');
      fig.className = 'dynamic-block-figure';
      if (b.imageUrl) {
        const img = document.createElement('img');
        img.src = b.imageUrl;
        img.alt = '';
        img.loading = 'lazy';
        fig.appendChild(img);
      }
      row.appendChild(fig);
    }
    if (admin) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'dynamic-block-delete';
      del.textContent = 'Remove';
      del.dataset.blockId = b.id;
      del.dataset.pageKey = pageKey;
      row.appendChild(del);
    }
    wrap.appendChild(row);
  }
  mount.innerHTML = '';
  mount.appendChild(wrap);

  if (admin) {
    mount.querySelectorAll('.dynamic-block-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.blockId;
        const pk = (btn as HTMLElement).dataset.pageKey || pageKey;
        if (!id || !confirm('Remove this block?')) return;
        const next = (blockState[pk] ?? []).filter((x) => x.id !== id);
        if (await saveBlocks(pk, next)) renderMount(mount, pk, true);
      });
    });
  }
}

function attachAdminDelegates(container: HTMLElement, mount: HTMLElement, pageKey: string): void {
  const bar = container.querySelector('.dynamic-blocks-admin-bar');
  if (!bar || bar.getAttribute('data-delegated') === 'true') return;
  bar.setAttribute('data-delegated', 'true');
  bar.addEventListener('click', async (e) => {
    const t = (e.target as HTMLElement).closest('[data-action]');
    if (!t) return;
    const action = t.getAttribute('data-action');
    const pk = pageKey;
    const blocks = blockState[pk] ?? [];

    if (action === 'add-text') {
      const text = prompt('Text for this block:', '');
      if (text === null) return;
      let align = (prompt('Alignment: left, right, or center', 'center') || 'center').toLowerCase() as DynamicBlockAlign;
      if (!['left', 'right', 'center'].includes(align)) align = 'center';
      const next: DynamicBlock[] = [...blocks, { id: makeId(), type: 'text', text, align }];
      if (await saveBlocks(pk, next)) renderMount(mount, pk, true);
    }

    if (action === 'add-image') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        let align = (prompt('Alignment: left, right, or center', 'center') || 'center').toLowerCase() as DynamicBlockAlign;
        if (!['left', 'right', 'center'].includes(align)) align = 'center';
        const id = makeId();
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1];
          const contentType = file.type || 'image/jpeg';
          const originalSrc = `/dynamic/${pk}/${id}.jpg`;
          try {
            const up = await fetch(UPLOAD_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                password: adminPassword(),
                originalSrc,
                fileBase64: base64,
                contentType,
              }),
            });
            const upParsed = await readResponseJson<{ url?: string; error?: string }>(up);
            if (!upParsed.ok) {
              alert('Upload failed: ' + upParsed.message);
              return;
            }
            const udata = upParsed.data;
            if (!up.ok || !udata.url) {
              alert(udata.error || 'Image upload failed');
              return;
            }
            const next: DynamicBlock[] = [...(blockState[pk] ?? []), { id, type: 'image', imageUrl: udata.url, align }];
            if (await saveBlocks(pk, next)) renderMount(mount, pk, true);
          } catch (err) {
            alert('Upload failed: ' + (err instanceof Error ? err.message : String(err)));
          }
        };
        reader.readAsDataURL(file);
      });
      input.click();
    }
  });
}

export async function initDynamicPageBlocks(container: HTMLElement, pageKey: string): Promise<void> {
  const mount = container.querySelector('.dynamic-blocks-mount');
  if (!mount) return;

  const cfg = await getSiteConfig();
  blockState[pageKey] = cfg?.dynamicBlocks?.[pageKey] ? [...cfg.dynamicBlocks[pageKey]!] : [];

  const admin = isAdmin();
  if (admin && !container.querySelector('.dynamic-blocks-admin-bar')) {
    const bar = document.createElement('div');
    bar.className = 'dynamic-blocks-admin-bar';
    bar.innerHTML = `
      <span class="dynamic-blocks-admin-label">Dynamic content</span>
      <button type="button" class="btn-dyn" data-action="add-text">+ Text</button>
      <button type="button" class="btn-dyn" data-action="add-image">+ Image</button>
    `;
    container.insertBefore(bar, mount);
    attachAdminDelegates(container, mount as HTMLElement, pageKey);
  }

  renderMount(mount as HTMLElement, pageKey, admin);
}
