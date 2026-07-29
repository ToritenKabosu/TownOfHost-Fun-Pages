import 'github-markdown-css/github-markdown.css';
import { marked } from 'marked';

const WIKI_RAW_BASE = 'https://raw.githubusercontent.com/wiki/ToritenKabosu/TownOfHost-Fun';
const GITHUB_WIKI_PATH = '/ToritenKabosu/TownOfHost-Fun/wiki/';
const DEFAULT_PAGE = 'Home';

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Wiki の表示に必要な要素が見つかりません: ${selector}`);
  }
  return element;
}

const menuEl = requiredElement<HTMLElement>('#wiki-menu');
const contentEl = requiredElement<HTMLElement>('#wiki-content');
const titleEl = requiredElement<HTMLElement>('#page-title');
const breadcrumbEl = requiredElement<HTMLElement>('#breadcrumb');
const appEl = requiredElement<HTMLElement>('#app');
const sidebarResizer = requiredElement<HTMLElement>('#sidebar-resizer');
const searchInput = requiredElement<HTMLInputElement>('#wiki-search');

const SIDEBAR_WIDTH_STORAGE_KEY = 'tohf-wiki-sidebar-width';
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 480;

const PAGE_CACHE_PREFIX = 'tohf:wiki:page:';
const SIDEBAR_CACHE_KEY = 'tohf:wiki:sidebar';
const pageCache = new Map<string, string>();

async function fetchWithTimeout(url: string, timeout = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] || character);
}

function convertWikiLinks(markdown: string): string {
  const wikiBaseUrl =
    "https://github.com/ToritenKabosu/TownOfHost-Fun/wiki/";

  return markdown.replace(/\[\[(.*?)\]\]/g, (_, value: string) => {
    const [label, pageName = label] = value.split("|").map((part) => part.trim());
    const encodedPageName = pageName
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    return `<a href="${wikiBaseUrl}${encodedPageName}">${escapeHtml(label)}</a>`;
  });
}

function removeRejectedSections(markdown: string): string {
  return markdown.replace(
    /<!--site:reject-->[\s\S]*?<!--site:\/reject-->/g,
    ''
  );
}

function convertDetailsComments(markdown: string): string {
  return markdown
    .replace(
      /<!--\s*(?:site\s*:\s*)?details\s*:\s*([\s\S]*?)(?::\s*open)?\s*-->/gi,
      (match: string, summary: string) => {
        const isOpen = /:\s*open\s*-->$/i.test(match);

        return `<details${isOpen ? ' open' : ''}><summary>${escapeHtml(summary.trim())}</summary>`;
      }
    )
    .replace(/<!--\s*(?:site\s*:\s*)?\/\s*details\s*-->/gi, "</details>");
}

function convertMarkdownLinks(markdown: string): string {
  return markdown.replace(/(?<!!)\[([^\]]+)\]\(([^\s)]+)(?:\s+['\"][^'\"]*['\"])?\)/g, (_, label: string, href: string) => (
    `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
  ));
}

function normalizeWikiMarkdown(markdown: string): string {
  return convertDetailsComments(convertWikiLinks(convertMarkdownLinks(removeRejectedSections(markdown))));
}

function wikiUrl(pageName: string): string {
  const encodedPageName = pageName.split('/').map(encodeURIComponent).join('/');
  return `${WIKI_RAW_BASE}/${encodedPageName}.md`;
}

type WikiRoute = { type: 'page'; pageName: string } | { type: 'category'; categoryId: string };

function currentRoute(): WikiRoute {
  const params = new URLSearchParams(location.hash.slice(1));
  const categoryId = params.get('category');
  return categoryId ? { type: 'category', categoryId } : { type: 'page', pageName: params.get('page') || DEFAULT_PAGE };
}

function setPageInUrl(pageName: string): void {
  const url = new URL(location.href);
  url.hash = `page=${encodeURIComponent(pageName)}`;
  history.pushState({}, '', url);
}

function setCategoryInUrl(categoryId: string): void {
  const url = new URL(location.href);
  url.hash = `category=${encodeURIComponent(categoryId)}`;
  history.pushState({}, '', url);
}

function clampSidebarWidth(width: number): number {
  const availableMaxWidth = Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - 320);
  return Math.round(Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH, availableMaxWidth));
}

function setSidebarWidth(width: number, save = true): void {
  const clampedWidth = clampSidebarWidth(width);
  appEl.style.setProperty('--sidebar-width', `${clampedWidth}px`);
  sidebarResizer.setAttribute('aria-valuenow', String(clampedWidth));

  if (save) localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clampedWidth));
}

function currentSidebarWidth(): number {
  const value = Number.parseInt(getComputedStyle(appEl).getPropertyValue('--sidebar-width'), 10);
  return Number.isFinite(value) ? value : 280;
}

function setupSidebarResizer(): void {
  const savedWidth = Number.parseInt(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) || '', 10);
  if (Number.isFinite(savedWidth)) setSidebarWidth(savedWidth, false);

  sidebarResizer.addEventListener('pointerdown', (event) => {
    if (window.matchMedia('(max-width: 720px)').matches) return;
    sidebarResizer.setPointerCapture(event.pointerId);
    document.body.classList.add('is-resizing');
  });

  sidebarResizer.addEventListener('pointermove', (event) => {
    if (!sidebarResizer.hasPointerCapture(event.pointerId)) return;
    setSidebarWidth(event.clientX - appEl.getBoundingClientRect().left);
  });

  const finishResize = (event: PointerEvent): void => {
    if (!sidebarResizer.hasPointerCapture(event.pointerId)) return;
    sidebarResizer.releasePointerCapture(event.pointerId);
    document.body.classList.remove('is-resizing');
  };
  sidebarResizer.addEventListener('pointerup', finishResize);
  sidebarResizer.addEventListener('pointercancel', finishResize);

  sidebarResizer.addEventListener('keydown', (event) => {
    const adjustment = event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10 : 0;
    if (adjustment) {
      event.preventDefault();
      setSidebarWidth(currentSidebarWidth() + adjustment);
    }
  });
}

function toKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

function filterSidebar(keyword: string): void {
  const rawKeyword = keyword.trim();

  if (!rawKeyword) {
    menuEl.querySelectorAll<HTMLLIElement>('li').forEach((li) => {
      li.style.display = '';
    });
    menuEl.querySelectorAll<HTMLDetailsElement>('details').forEach((details) => {
      details.style.display = '';
    });
    return;
  }

  const normalizedKeyword = toKatakana(rawKeyword.toLowerCase());

  const detailsList = menuEl.querySelectorAll<HTMLDetailsElement>('details');

  detailsList.forEach((details) => {
    let hasMatchInCategory = false;
    const items = details.querySelectorAll<HTMLLIElement>('li');

    items.forEach((li) => {
      const link = li.querySelector<HTMLAnchorElement>('a');
      const displayText = link ? (link.textContent || '') : (li.textContent || '');
      
      const normalizedText = toKatakana(displayText.toLowerCase());

      if (normalizedText.includes(normalizedKeyword)) {
        li.style.display = '';
        hasMatchInCategory = true;
      } else {
        li.style.display = 'none';
      }
    });

    if (hasMatchInCategory) {
      details.style.display = '';
      details.open = true;
    } else {
      details.style.display = 'none';
    }
  });
}

searchInput.addEventListener('input', () => {
  filterSidebar(searchInput.value);
});

function setupSidebarSearch(): void {
  searchInput.addEventListener('input', () => filterSidebar(searchInput.value));
}

function isExternalLink(href: string): boolean {
  return /^(https?:|mailto:|tel:|#)/i.test(href);
}

function resolveAssetUrl(src: string): string {
  if (/^(https?:|data:)/i.test(src)) return src;
  return new URL(src.replace(/^\//, ''), `${WIKI_RAW_BASE}/`).href;
}

function sanitizeHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script, iframe, object, embed, form, base').forEach((node) => node.remove());
  parsed.querySelectorAll<HTMLElement>('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return parsed.body.innerHTML;
}

function appendSiteLog(message: string, level: 'error' | 'warn' | 'info' = 'error'): void {
  if (level === 'error') console.error(message);
  else if (level === 'warn') console.warn(message);
  else console.log(message);

  try {
    let container = document.getElementById('site-log') as HTMLElement | null;
    if (!container) {
      container = document.createElement('div');
      container.id = 'site-log';
      container.style.position = 'fixed';
      container.style.right = '12px';
      container.style.bottom = '12px';
      container.style.zIndex = '9999';
      container.style.maxWidth = '360px';
      container.style.fontSize = '13px';
      document.body.append(container);
    }

    const entry = document.createElement('div');
    entry.className = `site-log-entry site-log-${level}`;
    entry.textContent = message;
    entry.style.margin = '6px 0';
    entry.style.padding = '8px 10px';
    entry.style.borderRadius = '8px';
    entry.style.color = '#fff';
    entry.style.boxShadow = '0 6px 18px rgba(0,0,0,.18)';
    if (level === 'error') entry.style.background = 'linear-gradient(180deg,#b91c1c,#7f1d1d)';
    else if (level === 'warn') entry.style.background = 'linear-gradient(180deg,#f59e0b,#b45309)';
    else entry.style.background = 'linear-gradient(180deg,#0ea5e9,#0369a1)';

    container.append(entry);
    setTimeout(() => entry.remove(), 20000);
  } catch (e) {
    /* ignore DOM errors */
  }
}

function showMessage(kind: 'loading' | 'error', message: string): void {
  contentEl.replaceChildren();
  const notice = document.createElement('p');
  notice.className = `wiki-notice wiki-notice--${kind}`;
  notice.textContent = message;
  contentEl.append(notice);
}

function updateActiveMenu(pageName: string): void {
  menuEl.querySelectorAll<HTMLAnchorElement>('a[data-wiki-page]').forEach((link) => {
    link.classList.toggle('active', link.dataset.wikiPage === pageName);
  });
}

function parentDetails(element: Element): HTMLDetailsElement[] {
  const ancestors: HTMLDetailsElement[] = [];
  let details = element.closest<HTMLDetailsElement>('details');
  while (details) {
    ancestors.unshift(details);
    details = details.parentElement?.closest<HTMLDetailsElement>('details') || null;
  }
  return ancestors;
}

function createMainPageBreadcrumb(): HTMLAnchorElement {
  const link = document.createElement('a');
  // Point to the site root index.html relative to the wiki folder
  link.href = '../index.html';
  link.textContent = 'メインページ';
  return link;
}

function createWikiBreadcrumb(): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = `wiki/#page=${encodeURIComponent(DEFAULT_PAGE)}`;
  link.dataset.wikiPage = DEFAULT_PAGE;
  link.textContent = 'Wiki';
  return link;
}

function createPageBreadcrumb(pageName: string, label = pageName): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = `wiki/#page=${encodeURIComponent(pageName)}`;
  link.dataset.wikiPage = pageName;
  link.textContent = label;
  return link;
}

function createCategoryBreadcrumb(details: HTMLDetailsElement): HTMLAnchorElement | null {
  const categoryId = details.dataset.categoryId;
  const summary = details.querySelector('summary');
  if (!categoryId || !summary?.textContent?.trim()) return null;

  const link = document.createElement('a');
  link.href = `wiki/#category=${encodeURIComponent(categoryId)}`;
  link.dataset.categoryId = categoryId;
  link.textContent = summary.textContent.trim();
  return link;
}

function renderBreadcrumb(currentLabel: string, details: HTMLDetailsElement[] = []): void {
  breadcrumbEl.replaceChildren();
  const crumbs: HTMLElement[] = [createMainPageBreadcrumb(), createWikiBreadcrumb()];

  if (currentLabel !== DEFAULT_PAGE) crumbs.push(createPageBreadcrumb(DEFAULT_PAGE, 'Home'));
  details.forEach((detail) => {
    const link = createCategoryBreadcrumb(detail);
    if (link) crumbs.push(link);
  });

  crumbs.forEach((crumb) => {
    breadcrumbEl.append(crumb, document.createTextNode('›'));
  });
  titleEl.textContent = currentLabel;
  breadcrumbEl.append(titleEl);
}

function renderPageBreadcrumb(pageName: string): void {
  const pageLink = [...menuEl.querySelectorAll<HTMLAnchorElement>('a[data-wiki-page]')]
    .find((link) => link.dataset.wikiPage === pageName);
  renderBreadcrumb(pageName, pageLink ? parentDetails(pageLink) : []);
}

function pageNameFromHref(href: string): string {
  return decodeURIComponent(href.replace(/^\.\//, '').replace(/\.md$/i, ''));
}

function wikiPageNameFromHref(href: string): string | null {
  if (!isExternalLink(href)) return pageNameFromHref(href);

  try {
    const url = new URL(href);
    if (url.origin === 'https://github.com' && url.pathname.startsWith(GITHUB_WIKI_PATH)) {
      return decodeURIComponent(url.pathname.slice(GITHUB_WIKI_PATH.length));
    }
  } catch {
  }

  return null;
}

function prepareWikiLinks(root: ParentNode): void {
  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const pageName = wikiPageNameFromHref(href);
    if (pageName) {
      link.dataset.wikiPage = pageName;
      return;
    }

    if (isExternalLink(href)) {
      if (/^https?:/i.test(href)) {
        link.target = '_blank';
        link.rel = 'noreferrer noopener';
      }
      return;
    }
  });
}

function removeSidebarLinkLineText(): void {
  menuEl.querySelectorAll<HTMLAnchorElement>('a').forEach((link) => {
    link.classList.add('wiki-menu-link');
    const line = link.closest('li, p');

    if (line) {
      line.classList.add('wiki-link-line');
      const textNodes: Text[] = [];
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!node.parentElement?.closest('a')) textNodes.push(node as Text);
      }
      textNodes.forEach((textNode) => textNode.remove());
      return;
    }

    for (const direction of ['previousSibling', 'nextSibling'] as const) {
      let sibling = link[direction];
      while (sibling?.nodeType === Node.TEXT_NODE) {
        const nextSibling = sibling[direction];
        sibling.remove();
        sibling = nextSibling;
      }
    }
  });

  menuEl.querySelectorAll('br').forEach((breakElement) => {
    if (breakElement.previousElementSibling?.matches('a') || breakElement.nextElementSibling?.matches('a')) {
      breakElement.remove();
    }
  });
}

function preparePageContent(): void {
  contentEl.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
    image.src = resolveAssetUrl(image.getAttribute('src') || '');
    image.loading = 'lazy';
  });
  prepareWikiLinks(contentEl);
}

async function loadWikiPage(pageName: string, updateUrl = false): Promise<void> {
  const normalizedPage = pageName.trim() || DEFAULT_PAGE;
  if (updateUrl) setPageInUrl(normalizedPage);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderPageBreadcrumb(normalizedPage);
  document.title = `${normalizedPage} | TownOfHost-Fun`;
  updateActiveMenu(normalizedPage);

  const cacheKey = PAGE_CACHE_PREFIX + normalizedPage;
  const cachedHtml = sessionStorage.getItem(cacheKey) || pageCache.get(normalizedPage);
  if (cachedHtml) {
    contentEl.innerHTML = cachedHtml;
    preparePageContent();
  } else {
    showMessage('loading', '読み込み中…');
  }

  try {
    const response = await fetchWithTimeout(wikiUrl(normalizedPage), 8000);
    if (!response.ok) throw new Error(`「${normalizedPage}」を取得できませんでした。${response.status == 404 ? "ページが見つかりません。" : `(${response.status})`}`);
    const markdown = normalizeWikiMarkdown(await response.text());
    const newHtml = sanitizeHtml(await marked.parse(markdown));

    if (newHtml !== cachedHtml) {
      contentEl.innerHTML = newHtml;
      preparePageContent();
      try {
        sessionStorage.setItem(cacheKey, newHtml);
      } catch {}
      pageCache.set(normalizedPage, newHtml);
    }
  } catch (error) {
    if (!cachedHtml) showMessage('error', error instanceof Error ? error.message : 'ページの読み込みに失敗しました。');
    else console.warn('Wiki background refresh failed:', error);
  }
}

function loadCategoryPage(categoryId: string, updateUrl = false): void {
  const details = menuEl.querySelector<HTMLDetailsElement>(`details[data-category-id="${CSS.escape(categoryId)}"]`);
  if (!details) {
    void loadWikiPage(DEFAULT_PAGE, updateUrl);
    return;
  }
  if (updateUrl) setCategoryInUrl(categoryId);

  const summary = details.querySelector('summary')?.textContent?.trim() || 'カテゴリ';
  renderBreadcrumb(summary, parentDetails(details).slice(0, -1));
  document.title = `${summary} | TownOfHost-Fun`;
  updateActiveMenu('');

  const heading = document.createElement('h1');
  heading.textContent = summary;
  const description = document.createElement('p');
  description.textContent = '目次:';
  const list = document.createElement('ul');
  list.className = 'category-page-list';

  const seenPages = new Set<string>();
  details.querySelectorAll<HTMLAnchorElement>('a[data-wiki-page]').forEach((link) => {
    const pageName = link.dataset.wikiPage;
    if (!pageName || seenPages.has(pageName)) return;
    seenPages.add(pageName);
    const item = document.createElement('li');
    item.append(createPageBreadcrumb(pageName, link.textContent?.trim() || pageName));
    list.append(item);
  });

  contentEl.replaceChildren(heading, description, list);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadSidebar(): Promise<void> {
  const cached = sessionStorage.getItem(SIDEBAR_CACHE_KEY);
  if (cached) {
    menuEl.innerHTML = cached;
    prepareWikiLinks(menuEl);
    removeSidebarLinkLineText();
    menuEl.querySelectorAll<HTMLDetailsElement>('details').forEach((details, index) => {
      details.dataset.categoryId = `category-${index}`;
    });
    filterSidebar(searchInput.value);
  } else {
    menuEl.innerHTML = '<p class="menu-loading">メニュー読み込み中…</p>';
  }

  try {
    const response = await fetchWithTimeout(wikiUrl('_Sidebar'), 8000);
    if (!response.ok) throw new Error('_Sidebar.md の取得に失敗しました。');
    const html = sanitizeHtml(await marked.parse(normalizeWikiMarkdown(await response.text())));
    if (html !== cached) {
      menuEl.innerHTML = html;
      prepareWikiLinks(menuEl);
      removeSidebarLinkLineText();
      menuEl.querySelectorAll<HTMLDetailsElement>('details').forEach((details, index) => {
        details.dataset.categoryId = `category-${index}`;
      });
      filterSidebar(searchInput.value);
      try { sessionStorage.setItem(SIDEBAR_CACHE_KEY, html); } catch {}
    }
  } catch (err) {
    if (!cached) {
      menuEl.innerHTML = '<p class="menu-error">メニューを読み込めませんでした。</p>';
      appendSiteLog(`Sidebar load failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } else {
      console.warn('Sidebar background refresh failed:', err);
      appendSiteLog(`Sidebar background refresh failed: ${err instanceof Error ? err.message : String(err)}`, 'warn');
    }
  }
}

document.addEventListener('click', (event) => {
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[data-wiki-page]');
  if (link?.dataset.wikiPage) {
    event.preventDefault();
    void loadWikiPage(link.dataset.wikiPage, true);
    return;
  }

  const categoryLink = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[data-category-id]');
  if (categoryLink?.dataset.categoryId) {
    event.preventDefault();
    loadCategoryPage(categoryLink.dataset.categoryId, true);
    return;
  }

  const externalLink = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[target="_blank"]');
  if (externalLink && (contentEl.contains(externalLink) || menuEl.contains(externalLink))) {
    event.preventDefault();
    const confirmed = window.confirm(`外部サイトへ移動します。よろしいですか？\n\n${externalLink.href}`);
    if (confirmed) {
      window.open(externalLink.href, '_blank', 'noopener,noreferrer');
    }
  }
});

function loadCurrentRoute(): void {
  const route = currentRoute();
  if (route.type === 'category') loadCategoryPage(route.categoryId);
  else void loadWikiPage(route.pageName);
}

window.addEventListener('popstate', loadCurrentRoute);
setupSidebarResizer();
setupSidebarSearch();

await loadSidebar();
loadCurrentRoute();