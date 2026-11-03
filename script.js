/* JM TECH · tienda de demostración con panel administrativo en servidor local. */
'use strict';

/* ---------- Utilidades ---------- */
const KEY = 'nexora_mobile_v2';
const DEMO_COUPON = 'JMTECH10';
const $ = (s) => document.querySelector(s);
const money = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateKey = (iso) => new Date(iso).toLocaleDateString('es-CO');
const LOW_STOCK = 3;
const BRANDS = ['Apple', 'Samsung', 'Xiaomi', 'Motorola', 'HONOR', 'OPPO'];
const WHATSAPP_NUMBER = '';
const BRAND_COLOR = { Apple: '#0A142B', Samsung: '#0866FF', Xiaomi: '#F59E0B', Motorola: '#10B981', HONOR: '#7047EB', OPPO: '#179C68' };

const ICONS = {
  store: 'M3 9l2-5h14l2 5M4 9v11h16V9M9 20v-6h6v6', home: 'M3 11l9-8 9 8v10H3z', box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  tag: 'M20 12l-8 8-9-9V3h8z', list: 'M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1', users: 'M16 19v-2a4 4 0 00-8 0v2M12 11a3 3 0 100-6 3 3 0 000 6',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2', gear: 'M12 15a3 3 0 100-6 3 3 0 000 6M12 2v3M12 19v3M2 12h3M19 12h3', bell: 'M6 9a6 6 0 0112 0c0 6 3 8 3 8H3s3-2 3-8M10 21h4',
  cart: 'M3 3h2l3 12h11l2-8H6M9 20h.1M18 20h.1', money: 'M12 2v20M17 6H9a3 3 0 000 6h6a3 3 0 010 6H6'
};
const icon = (n) => `<svg class="ic" viewBox="0 0 24 24"><path d="${ICONS[n]}"/></svg>`;

function imagePlaceholder(brand, big = false) {
  return `<span class="image-placeholder ${big ? 'large' : ''}" role="img" aria-label="Fotografía oficial pendiente para ${esc(brand)}"><span class="placeholder-icon" aria-hidden="true">＋</span><span>Fotografía oficial pendiente</span><small>Agrega una imagen autorizada</small></span>`;
}

/* ---------- Datos y persistencia (localStorage) ---------- */
function seedData() {
  const catalog = window.JMTECH_CATALOG;
  return {
    products: catalog.map((p) => ({ ...p, features: [...p.features] })),
    clients: [], sales: [], orders: [], nextO: 1, cart: [], favorites: [], compare: [], recent: [], couponCode: '',
    nextP: Math.max(...catalog.map((p) => p.id)) + 1, nextC: 1, nextS: 1001
  };
}
let csrfToken = '';
let adminRevision = 0;
let adminSaveQueue = Promise.resolve();
let legacyAdminState = null;
let legacyOrdersPresent = false;

async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(data && data.error ? data.error : 'No se pudo completar la solicitud.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function adminStateSnapshot() {
  return {
    products: S.products, clients: S.clients, sales: S.sales,
    nextP: S.nextP, nextC: S.nextC, nextS: S.nextS, revision: adminRevision
  };
}

function saveGuestData() {
  try {
    const guestData = {
      cart: S.cart, favorites: S.favorites, compare: S.compare,
      recent: S.recent, couponCode: S.couponCode
    };
    if (legacyAdminState) {
      const previous = JSON.parse(localStorage.getItem(KEY) || '{}');
      localStorage.setItem(KEY, JSON.stringify({ ...previous, ...guestData }));
    } else {
      localStorage.setItem(KEY, JSON.stringify(guestData));
    }
  } catch (error) {
    console.error('No se pudieron guardar las preferencias locales de JM TECH.', error);
    toast('No se pudieron guardar tus preferencias en este navegador.', 'warn');
  }
}

function applyAdminState(state) {
  S.products = state.products;
  S.clients = state.clients;
  S.sales = state.sales;
  S.nextP = state.nextP;
  S.nextC = state.nextC;
  S.nextS = state.nextS;
  adminRevision = state.revision;
}

function save() {
  saveGuestData();

  if (ui.admin) {
    adminSaveQueue = adminSaveQueue.then(async () => {
      const result = await api('/api/admin/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(adminStateSnapshot())
      });
      adminRevision = result.revision;
    }).catch(async (error) => {
      console.error('No se pudieron guardar los cambios administrativos en el servidor.', error);
      toast(`No se guardaron los cambios: ${error.message}`, 'error');
      if (error.status === 401) {
        await endAdminSession(false);
        return;
      }
      try {
        applyAdminState(await api('/api/admin/state'));
        show(ui.view);
      } catch (restoreError) {
        console.error('No se pudo restaurar el estado administrativo del servidor.', restoreError);
        await endAdminSession(false);
      }
    });
  }
}

function validLegacyOrder(order) {
  if (!order || typeof order !== 'object' || Array.isArray(order)
    || typeof order.id !== 'string' || order.id.length > 40
    || typeof order.date !== 'string' || Number.isNaN(Date.parse(order.date))
    || !Number.isSafeInteger(order.total) || order.total < 0
    || typeof order.status !== 'string' || order.status.length > 100
    || !Array.isArray(order.items) || order.items.length > 100
    || !order.items.every((item) => item && typeof item === 'object'
      && Number.isSafeInteger(item.pid) && typeof item.name === 'string' && item.name.length <= 120
      && Number.isSafeInteger(item.price) && item.price >= 0
      && Number.isSafeInteger(item.qty) && item.qty > 0 && item.qty <= 1000)) return false;
  const details = order.d;
  return details && typeof details === 'object' && !Array.isArray(details)
    && ['name', 'phone', 'email', 'city', 'address', 'notes'].every((key) => typeof details[key] === 'string' && details[key].length <= 200)
    && ['envio', 'recoger'].includes(details.delivery)
    && ['whatsapp', 'transferencia', 'contraentrega'].includes(details.pay);
}

function load() {
  const state = seedData();
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (stored && typeof stored === 'object') {
      if (Array.isArray(stored.products) && Array.isArray(stored.clients) && Array.isArray(stored.sales)) {
        legacyAdminState = {
          products: stored.products.map((product) => ({
            ...(product && typeof product === 'object' ? product : {}),
            condition: product && product.condition || 'Nuevo (demo)',
            features: product && Array.isArray(product.features) ? product.features : [],
            image: product && typeof product.image === 'string' ? product.image : '',
            imageSource: product && typeof product.imageSource === 'string' ? product.imageSource : '',
            imageCredit: product && typeof product.imageCredit === 'string' ? product.imageCredit : '',
            imageLicense: product && typeof product.imageLicense === 'string' ? product.imageLicense : '',
            oldPriceSource: product && typeof product.oldPriceSource === 'string' ? product.oldPriceSource : ''
          })),
          clients: stored.clients,
          sales: stored.sales,
          nextP: Number.isSafeInteger(stored.nextP) && stored.nextP > 0 ? stored.nextP : state.nextP,
          nextC: Number.isSafeInteger(stored.nextC) && stored.nextC > 0 ? stored.nextC : 1,
          nextS: Number.isSafeInteger(stored.nextS) && stored.nextS > 0 ? stored.nextS : 1001
        };
      }
      state.orders = Array.isArray(stored.orders) ? stored.orders.filter(validLegacyOrder) : [];
      legacyOrdersPresent = state.orders.length > 0;
      ['cart', 'favorites', 'compare', 'recent'].forEach((key) => {
        if (Array.isArray(stored[key])) state[key] = stored[key];
      });
      state.cart = state.cart.filter((item) => item && Number.isSafeInteger(item.pid) && Number.isSafeInteger(item.qty) && item.qty > 0);
      ['favorites', 'compare', 'recent'].forEach((key) => {
        state[key] = state[key].filter((id) => Number.isSafeInteger(id) && id > 0);
      });
      if (typeof stored.couponCode === 'string') {
        state.couponCode = ['JMTECH10', 'TECHNOVA10', 'NEXORA10', 'ORBITA10', 'KORAMOBILE10'].includes(stored.couponCode)
          ? DEMO_COUPON : '';
      }
    }
  } catch (error) {
    console.error('No se pudieron leer los datos locales de JM TECH.', error);
  }
  return state;
}
let S = load();
let ui = { view: 'store', brand: 'Todos', q: '', detailId: null, detailQty: 1, f: { price: '', cap: '', color: '', only: false, condition: '', tier: '' }, offers: false, sort: 'featured', draft: {}, dq: '', pf: { q: '', brand: '', status: '' }, cq: '', reportStart: '', reportEnd: '', admin: false, confirmCb: null, chat: [], shopMenuOpen: false };

/* ---------- Cálculos reutilizables ---------- */
const getP = (id) => S.products.find((p) => p.id === id);
const statusOf = (p) => (p.stock === 0 ? ['Agotado', 't-bad'] : p.stock <= LOW_STOCK ? ['Stock bajo', 't-warn'] : ['Disponible', 't-ok']);
function calc(items, coupon = '') {
  const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
  const discount = coupon === DEMO_COUPON ? Math.round(subtotal * 0.1) : 0;
  return { subtotal, discount, total: subtotal - discount };
}
const cartItems = () => S.cart.map((c) => { const p = getP(c.pid); return p ? { pid: p.id, name: p.name, brand: p.brand, price: p.price, qty: c.qty } : null; }).filter(Boolean);
const salesCount = (cid) => S.sales.filter((s) => s.cid === cid).length;

/** Registra una venta validando existencias; descuenta stock y sincroniza todo. */
function commitSale(items, cid, client, method, status) {
  if (!items.length) return 'No hay productos seleccionados.';
  for (const i of items) {
    const p = getP(i.pid);
    if (!p) return `${i.name} ya no existe en el catálogo.`;
    if (!Number.isInteger(i.qty) || i.qty < 1) return `Cantidad inválida para ${p.name}.`;
    if (i.qty > p.stock) return `Solo quedan ${p.stock} unidades de ${p.name}.`;
  }
  items.forEach((i) => { getP(i.pid).stock -= i.qty; });
  const sale = { id: S.nextS++, cid, client, items: items.map((i) => ({ pid: i.pid, name: i.name, brand: i.brand, price: i.price, qty: i.qty })), date: new Date().toISOString(), method, status };
  sale.total = calc(sale.items).total;
  S.sales.push(sale);
  save(); refreshChrome();
  return null;
}

/* ---------- Interfaz base ---------- */
const NAV = [['store', 'Tienda', 'store'], ['dashboard', 'Inicio', 'home'], ['products', 'Productos', 'box'], ['sales', 'Ventas', 'tag'], ['inventory', 'Inventario', 'list'], ['clients', 'Clientes', 'users'], ['reports', 'Reportes', 'chart'], ['settings', 'Configuración', 'gear']];
const TITLES = {
  store: ['Tienda virtual', 'Encuentra tu próximo celular'], detail: ['Detalle del producto', 'Todo lo que necesitas saber'], cart: ['Carrito de compras', 'Revisa tu pedido antes de finalizar'],
  favorites: ['Mis favoritos', 'Productos guardados en este navegador'], compare: ['Comparar celulares', 'Compara la información disponible en el catálogo'],
  assistant: ['Asistente de JM TECH', 'Recomendaciones basadas en el catálogo disponible'], faq: ['Preguntas frecuentes', 'Información de esta demostración'],
  about: ['Nosotros', 'La identidad y el alcance de JM TECH'], contact: ['Contacto', 'Formulario de demostración, sin envío de mensajes'], account: ['Mis pedidos', 'Pedidos temporales de esta sesión'],
  dashboard: ['Panel de control', 'Resumen de ventas e inventario'], products: ['Productos', 'Gestiona tu catálogo'], inventory: ['Inventario', 'Existencias y alertas de stock'],
  sales: ['Registro de ventas', 'Registra una venta manual'], clients: ['Clientes', 'Administra tu base de clientes'], reports: ['Reportes', 'Historial completo de ventas'], settings: ['Configuración', 'Seguridad y datos de demostración']
};
const ADMIN_ONLY = ['dashboard', 'products', 'inventory', 'sales', 'clients', 'reports', 'settings'];
const SHOP_VIEWS = ['store', 'detail', 'cart', 'favorites', 'compare', 'assistant', 'faq', 'about', 'contact', 'account'];

function toast(msg, type = 'ok') {
  const t = document.createElement('div'); t.className = `toast ${type === 'ok' ? '' : type}`; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3500);
}
function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false; const f = m.querySelector('input,select,button'); if (f) f.focus(); }
const closeModal = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };
function confirmBox(msg, cb, label = 'Eliminar') {
  ui.confirmCb = cb;
  openModal(`<h3>Confirmar acción</h3><p style="margin-top:10px">${esc(msg)}</p><div class="acts"><button class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn danger" data-act="confirmYes">${label}</button></div>`);
}

function refreshChrome() {
  const units = S.cart.reduce((a, c) => a + c.qty, 0);
  $('#cartCount').textContent = units || ''; $('#shopCartCount').textContent = units || '';
  $('#favoriteCount').textContent = S.favorites.length || '';
  const low = S.products.filter((p) => p.stock <= LOW_STOCK).length;
  $('#notifCount').textContent = low || '';
  $('#nav').innerHTML = NAV.filter((n) => ui.admin || n[0] === 'store').map(([v, label, ic]) => `<button class="nav-item ${ui.view === v ? 'on' : ''}" data-act="nav" data-v="${v}">${icon(ic)}${label}</button>`).join('');
  const inStore = ui.view === 'store';
  const links = [
    ['home', 'Inicio', inStore && !filtersActive()],
    ['shopNow', 'Tienda', inStore && (filtersActive() || ui.offers)],
    ['tier', 'Gama baja', false, 'low'],
    ['tier', 'Gama media', false, 'medium'],
    ['tier', 'Gama alta', false, 'high'],
    ['offers', 'Ofertas', inStore && ui.offers],
    ['about', 'Nosotros', ui.view === 'about'],
    ['contact', 'Contacto', ui.view === 'contact']
  ];
  $('#shopNav').innerHTML = links.map(([act, t, on, target]) => `<button class="snav ${on ? 'on' : ''}" data-act="${act}" ${act === 'tier' ? `data-tier="${target}"` : act === 'nav' ? `data-v="${target}"` : ''}>${t}</button>`).join('');
  const menuButton = $('.shop-menu-btn');
  menuButton.setAttribute('aria-expanded', String(ui.shopMenuOpen));
  menuButton.setAttribute('aria-label', ui.shopMenuOpen ? 'Cerrar menú de tienda' : 'Abrir menú de tienda');
  $('#shopNav').classList.toggle('open', ui.shopMenuOpen);
  const acct = $('#shopAcct'); acct.textContent = ui.admin ? 'Panel' : 'Ingresar'; acct.dataset.act = ui.admin ? 'nav' : 'login'; acct.dataset.v = 'dashboard';
}

function show(view, arg) {
  if (ADMIN_ONLY.includes(view) && !ui.admin) { toast('Inicia sesión como administrador para entrar aquí.', 'warn'); view = 'store'; }
  ui.view = view; ui.shopMenuOpen = false; if (arg !== undefined) ui.detailId = arg;
  const [t, s] = TITLES[view]; $('#title').textContent = t; $('#subtitle').textContent = s;
  $('#side').classList.remove('open');
  $('#app').classList.toggle('shop', SHOP_VIEWS.includes(view));
  const render = { store: viewStore, detail: viewDetail, cart: viewCart, favorites: viewFavorites, compare: viewCompare, assistant: viewAssistant, faq: viewFaq, about: viewAbout, contact: viewContact, account: viewAccount, dashboard: viewDashboard, products: () => viewProducts(false), inventory: () => viewProducts(true), sales: viewSales, clients: viewClients, reports: viewReports, settings: viewSettings }[view];
  $('#view').innerHTML = render();
  if (view === 'store') renderGrid(); if (view === 'products' || view === 'inventory') renderProdTable(); if (view === 'sales') renderDraft(); if (view === 'clients') renderClientTable(); if (view === 'reports') renderReports();
  if (view === 'assistant') {
    if (!ui.chat.length) ui.chat.push({ role: 'assistant', text: '¡Hola! Soy el asistente de JM TECH. Puedo filtrar por gama y presupuesto, comparar celulares y revisar las características registradas. ¿Qué estás buscando?' });
    renderChat();
  }
  if (view === 'detail') {
    S.recent = [ui.detailId, ...S.recent.filter((id) => id !== ui.detailId)].slice(0, 6);
    save();
  }
  refreshChrome(); window.scrollTo(0, 0);
}

/* ---------- Tienda (aspecto claro y comercial) ---------- */
const PRICE_RANGES = { 1: [0, 1e6], 2: [1e6, 2e6], 3: [2e6, 3e6], 4: [3e6, Infinity] };
const TIERS = [
  { id: 'low', name: 'Gama baja', range: 'Hasta $1.000.000 COP', description: 'Esenciales para el día a día' },
  { id: 'medium', name: 'Gama media', range: '$1.000.001 a $2.000.000 COP', description: 'Equilibrio entre precio y funciones' },
  { id: 'high', name: 'Gama alta', range: 'Más de $2.000.000 COP', description: 'Modelos premium del catálogo' }
];
const tierOf = (product) => product.price <= 1_000_000 ? TIERS[0] : product.price <= 2_000_000 ? TIERS[1] : TIERS[2];
const isOffer = (p) => Number.isFinite(p.oldPrice) && p.oldPrice > p.price && /^https:\/\/[^\s]+$/i.test(p.oldPriceSource || '');
const discOf = (p) => (isOffer(p) ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);
const filtersActive = () => ui.brand !== 'Todos' || ui.q || ui.offers || ui.f.price || ui.f.cap || ui.f.color || ui.f.only || ui.f.condition || ui.f.tier;
const resetFilters = () => { ui.brand = 'Todos'; ui.offers = false; ui.q = ''; ui.f = { price: '', cap: '', color: '', only: false, condition: '', tier: '' }; $('#storeQ').value = ''; };

/** Muestra una imagen configurada o un marcador explícito si no existe una foto verificable. */
function phoneVisual(p, big) {
  const fallback = imagePlaceholder(p.name, big);
  if (!p.image) return fallback;
  return `<img src="${esc(p.image)}" alt="Fotografía de ${esc(p.name)}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>${fallback}</span>`;
}
function imageAttribution(p) {
  if (!p.image || !p.imageCredit) return '';
  if (!/^https:\/\/[^\s]+$/i.test(p.imageSource || '')) return `<small class="image-credit">Foto: ${esc(p.imageCredit)}</small>`;
  const license = /^https:\/\/[^\s]+$/i.test(p.imageLicense || '')
    ? ` · <a href="${esc(p.imageLicense)}" target="_blank" rel="noopener noreferrer">Licencia</a>`
    : '';
  return `<small class="image-credit">Foto: ${esc(p.imageCredit)} · <a href="${esc(p.imageSource)}" target="_blank" rel="noopener noreferrer">Fuente</a>${license}</small>`;
}
function productCard(p) {
  const [label, cls] = statusOf(p), discount = discOf(p);
  const favorite = S.favorites.includes(p.id);
  const compared = S.compare.includes(p.id);
  return `<article class="pcard"><button class="pimg" data-act="detail" data-id="${p.id}" aria-label="Ver detalle de ${esc(p.name)}">${phoneVisual(p)}</button>${imageAttribution(p)}
  <span class="muted">${esc(p.brand)} · ${esc(p.storage)} · ${esc(p.color)}</span><h3>${esc(p.name)}</h3>
  <span class="tag tier-tag tier-${tierOf(p).id}">${tierOf(p).name} · clasificación por precio demo</span>
  <div class="prices"><span class="price">${money(p.price)}</span>${discount ? `<s class="old">${money(p.oldPrice)}</s><span class="tag t-ok">-${discount}%</span>` : ''}</div>
  ${discount ? `<a class="price-source" href="${esc(p.oldPriceSource)}" target="_blank" rel="noopener noreferrer">Fuente del precio anterior</a>` : ''}
  <span><span class="tag ${cls}">${label}${p.stock ? ` · ${p.stock} uds.` : ''}</span> <span class="tag t-demo">Precio y stock de demostración</span></span>
  <div class="row"><button class="btn ghost" data-act="detail" data-id="${p.id}">Ver detalle</button><button class="btn primary" data-act="add" data-id="${p.id}" ${p.stock ? '' : 'disabled'}>Agregar al carrito</button></div>
  <div class="product-tools"><button class="link" data-act="toggleFavorite" data-id="${p.id}" aria-pressed="${favorite}">${favorite ? '♥ Guardado' : '♡ Favorito'}</button><button class="link" data-act="toggleCompare" data-id="${p.id}" aria-pressed="${compared}">${compared ? '− Comparar' : '+ Comparar'}</button></div></article>`;
}
function viewStore() {
  const feat = [...S.products].slice(0, 4);
  const offers = S.products.filter(isOffer).slice(0, 4);
  const uniq = (k) => [...new Set(S.products.map((p) => p[k]))];
  const sel = (id, label, opts, val) => `<select id="${id}" aria-label="${label}"><option value="">${label}</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const f = ui.f;
  const perks = [['Catálogo editable', 'Productos en productos.js'], ['Fotos de producto', 'Referencias y fuentes visibles'], ['Compra', 'Sin pasarela de pago'], ['Asistente', 'Recomendaciones por gama y presupuesto']];
  const heroPhones = S.products.filter((product) => product.image && product.id !== 3).slice(0, 3);
  return `<section class="shero"><div class="shero-text"><span class="pill">JM TECH · celulares que van contigo</span><h2>Lo último en tecnología. A tu alcance.</h2><p>Encuentra el celular ideal para ti: explora las gamas, compara modelos y descubre opciones para tu presupuesto. Catálogo, precios y existencias son datos de demostración.</p>
  <div class="row2"><button class="btn primary" data-act="shopNow">Explorar tienda <span aria-hidden="true">→</span></button><button class="btn ghost" data-act="nav" data-v="assistant">Encuentra el tuyo</button></div><div class="hero-trust"><span>✦ Precios de demostración</span><span>◈ Comparación sencilla</span><span>⌁ Asistente de compra</span></div></div><div class="shero-art" aria-hidden="true"><div class="hero-phone-stack">${heroPhones.map((product, index) => `<span class="hero-phone hero-phone-${index + 1}"><img src="${esc(product.image)}" alt="" loading="${index ? 'lazy' : 'eager'}" onerror="this.hidden=true"></span>`).join('')}<span class="hero-sparkle">✦</span></div><span class="hero-caption">TECNOLOGÍA QUE TE MUEVE</span></div></section>
  <section class="perks">${perks.map(([a, b]) => `<div><b>${a}</b><span class="muted">${b}</span></div>`).join('')}</section>
  <div id="home-sections">
  <section class="tier-section"><div class="sec-head"><div><h2>Encuentra tu gama</h2><p class="muted">Una guía orientativa calculada con los precios de demostración.</p></div></div><div class="tier-grid">${TIERS.map((tier, index) => `<button class="tier-card tier-${tier.id}" data-act="tier" data-tier="${tier.id}"><span class="tier-index">0${index + 1}</span><b>${tier.name}</b><span>${tier.description}</span><small>${tier.range}</small><strong>${S.products.filter((product) => tierOf(product).id === tier.id).length} modelos <span aria-hidden="true">→</span></strong></button>`).join('')}</div></section>
  <section><div class="sec-head"><div><h2>Celulares destacados</h2><p class="muted">Modelos para cada estilo y presupuesto</p></div><button class="link" data-act="shopNow">Ver todos <span aria-hidden="true">→</span></button></div><div class="products">${feat.map(productCard).join('')}</div></section>
  <section class="promos"><button class="promo p1" data-act="brand" data-b="Samsung"><b>Colección Samsung</b><span>Galaxy A y serie S</span></button><button class="promo p2" data-act="brand" data-b="Apple"><b>Colección Apple</b><span>iPhone 14 y 15</span></button></section>
  ${offers.length ? `<section><div class="sec-head"><h2>Ofertas configuradas</h2><button class="link" data-act="offers">Ver todas</button></div><div class="products">${offers.map(productCard).join('')}</div></section>` : ''}
  ${S.recent.length ? `<section><div class="sec-head"><h2>Vistos recientemente</h2></div><div class="products">${S.recent.map(getP).filter(Boolean).map(productCard).join('')}</div></section>` : ''}
  <section><div class="sec-head"><h2>Colecciones por marca</h2></div><div class="brands">${BRANDS.map((b) => `<button class="btile" data-act="brand" data-b="${b}"><span>${imagePlaceholder(b)}</span><b>${b}</b><small>${S.products.filter((p) => p.brand === b).length} modelos</small></button>`).join('')}</div></section></div>
  <section id="catalog"><div class="sec-head"><h2>Catálogo</h2><span id="count" class="muted"></span></div>
  <div class="filters">${sel('sfTier', 'Gama', [['low', 'Gama baja · hasta $1.000.000'], ['medium', 'Gama media · $1.000.001 a $2.000.000'], ['high', 'Gama alta · más de $2.000.000']], f.tier)}${sel('sfBrand', 'Marca', BRANDS.map((b) => [b, b]), ui.brand === 'Todos' ? '' : ui.brand)}${sel('sfPrice', 'Precio', [['1', 'Hasta $ 1.000.000'], ['2', '$ 1.000.000 a $ 2.000.000'], ['3', '$ 2.000.000 a $ 3.000.000'], ['4', 'Más de $ 3.000.000']], f.price)}${sel('sfCap', 'Capacidad', uniq('storage').map((x) => [x, x]), f.cap)}${sel('sfColor', 'Color', uniq('color').map((x) => [x, x]), f.color)}${sel('sfCondition', 'Estado', uniq('condition').map((x) => [x, x]), f.condition)}
  <label class="chk"><input type="checkbox" id="sfOnly" ${f.only ? 'checked' : ''}> Solo disponibles</label><label class="sort-label" for="sfSort">Ordenar</label><select id="sfSort" aria-label="Ordenar productos"><option value="featured" ${ui.sort === 'featured' ? 'selected' : ''}>Recomendados</option><option value="priceAsc" ${ui.sort === 'priceAsc' ? 'selected' : ''}>Precio: menor a mayor</option><option value="priceDesc" ${ui.sort === 'priceDesc' ? 'selected' : ''}>Precio: mayor a menor</option><option value="name" ${ui.sort === 'name' ? 'selected' : ''}>Nombre</option><option value="newest" ${ui.sort === 'newest' ? 'selected' : ''}>Novedades</option></select><button class="btn ghost sm" data-act="clearF">Limpiar filtros</button></div><div id="grid" class="products"></div></section>`;
}
function renderGrid() {
  const q = ui.q.toLowerCase(), f = ui.f, pr = PRICE_RANGES[f.price];
  const list = S.products.filter((p) => (ui.brand === 'Todos' || p.brand === ui.brand) && (p.name + p.brand + p.storage + p.color + tierOf(p).name + (p.features || []).join(' ')).toLowerCase().includes(q) && (!f.tier || tierOf(p).id === f.tier) && (!pr || (p.price >= pr[0] && p.price < pr[1])) && (!f.cap || p.storage === f.cap) && (!f.color || p.color === f.color) && (!f.condition || p.condition === f.condition) && (!f.only || p.stock > 0) && (!ui.offers || isOffer(p)));
  if (ui.sort === 'priceAsc') list.sort((a, b) => a.price - b.price);
  else if (ui.sort === 'priceDesc') list.sort((a, b) => b.price - a.price);
  else if (ui.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  else if (ui.sort === 'newest') list.sort((a, b) => b.id - a.id);
  $('#home-sections').hidden = !!filtersActive();
  $('#count').textContent = `${list.length} ${list.length === 1 ? 'celular' : 'celulares'}`;
  $('#grid').innerHTML = list.length ? list.map(productCard).join('') : '<div class="empty card" style="grid-column:1/-1">No encontramos celulares con esos filtros. Prueba quitando alguno o usa "Limpiar filtros".</div>';
}

function viewDetail() {
  const p = getP(ui.detailId); if (!p) return '<div class="card empty">Este producto ya no está disponible.</div>';
  const [label, cls] = statusOf(p), discount = discOf(p); ui.detailQty = Math.min(ui.detailQty, Math.max(p.stock, 1));
  return `<nav class="crumb" aria-label="Ruta"><button class="link" data-act="home">Inicio</button> / <button class="link" data-act="brand" data-b="${p.brand}">${esc(p.brand)}</button> / ${esc(p.name)}</nav>
  <div class="sdetail"><div><div class="pimg big">${phoneVisual(p, true)}</div>${imageAttribution(p)}</div><div class="sinfo">
  <span class="muted">${esc(p.brand)} · ${esc(p.condition || 'Estado por verificar')}</span><h2>${esc(p.name)}</h2>
  <span class="tag tier-tag tier-${tierOf(p).id}">${tierOf(p).name} · clasificación por precio demo</span>
  <div class="prices"><span class="price big">${money(p.price)}</span>${discount ? `<s class="old">${money(p.oldPrice)}</s><span class="tag t-ok">-${discount}%</span>` : ''}</div><span class="tag t-demo">Precio y especificaciones de demostración</span>${discount ? `<a class="price-source" href="${esc(p.oldPriceSource)}" target="_blank" rel="noopener noreferrer">Ver fuente del precio anterior</a>` : ''}
  <p>${esc(p.desc)}</p>
  <table class="specs"><tbody><tr><th>Marca</th><td>${esc(p.brand)}</td></tr><tr><th>Almacenamiento</th><td>${esc(p.storage)}</td></tr><tr><th>Color</th><td>${esc(p.color)}</td></tr><tr><th>Características declaradas</th><td>${(p.features || []).map(esc).join(' · ') || 'Sin información'}</td></tr>
  <tr><th>Disponibilidad</th><td><span class="tag ${cls}">${label}${p.stock ? ` · ${p.stock} uds. (demo)` : ''}</span></td></tr></tbody></table>
  <div class="qty"><button class="btn ghost sm" data-act="dq" data-d="-1" aria-label="Disminuir">−</button><b id="dqty">${ui.detailQty}</b><button class="btn ghost sm" data-act="dq" data-d="1" aria-label="Aumentar">+</button></div>
  <div class="row"><button class="btn primary" data-act="addDetail" ${p.stock ? '' : 'disabled'}>Agregar al carrito</button><button class="btn ghost" data-act="buyNow" ${p.stock ? '' : 'disabled'}>Comprar ahora</button></div>
  <div class="row"><button class="btn ghost" data-act="toggleFavorite" data-id="${p.id}" aria-pressed="${S.favorites.includes(p.id)}">${S.favorites.includes(p.id) ? '♥ En favoritos' : '♡ Agregar a favoritos'}</button><button class="btn ghost" data-act="toggleCompare" data-id="${p.id}" aria-pressed="${S.compare.includes(p.id)}">Comparar</button></div>
  <div class="row"><button class="btn ghost" data-act="consult" data-id="${p.id}">Consultar</button><button class="btn ghost" data-act="nav" data-v="store">Volver al catálogo</button></div></div></div>`;
}
function consultForm(p) {
  openModal(`<form data-form="consult" novalidate><h3>Consultar ${p ? 'por ' + esc(p.name) : 'un celular'}</h3><p class="muted">Simulación: no se envía ningún mensaje real.</p>
  <label for="kn">Nombre</label><input id="kn"><label for="kc">Correo o teléfono</label><input id="kc"><label for="km">Mensaje</label><input id="km" value="${p ? 'Hola, quiero información sobre ' + esc(p.name) + '.' : ''}">
  <p class="err" id="ferr" role="alert"></p><div class="acts"><button type="button" class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn primary" type="submit">Enviar consulta</button></div></form>`);
}

/* ---------- Carrito ---------- */
function addToCart(pid, qty = 1) {
  const p = getP(pid); if (!p) return false;
  const line = S.cart.find((c) => c.pid === pid); const next = (line ? line.qty : 0) + qty;
  if (next > p.stock) { toast(`Solo hay ${p.stock} unidades de ${p.name}.`, 'warn'); return false; }
  if (line) line.qty = next; else S.cart.push({ pid, qty });
  save(); refreshChrome(); toast(`${p.name} agregado al carrito.`); return true;
}
function viewCart() {
  const items = cartItems(); S.cart = S.cart.filter((c) => getP(c.pid));
  if (!items.length) return `<div class="card empty"><h3>Tu carrito está vacío</h3><p style="margin:8px 0 16px">Agrega un celular desde el catálogo para empezar.</p><button class="btn primary" data-act="nav" data-v="store">Seguir comprando</button></div>`;
  const t = calc(items, S.couponCode);
  return `<div class="cart"><div class="card">${items.map((i) => `<div class="line"><span class="mini">${phoneVisual(getP(i.pid))}</span><div class="info"><b>${esc(i.name)}</b><div class="muted">${money(i.price)} c/u</div></div>
  <div class="qty"><button class="btn ghost sm" data-act="cq" data-id="${i.pid}" data-d="-1" aria-label="Disminuir">−</button><b>${i.qty}</b><button class="btn ghost sm" data-act="cq" data-id="${i.pid}" data-d="1" aria-label="Aumentar">+</button></div>
  <b>${money(i.price * i.qty)}</b><button class="btn danger sm" data-act="cdel" data-id="${i.pid}">Eliminar</button></div>`).join('')}</div>
  <div class="card sum"><h3>Resumen</h3><div><span>Subtotal</span><span>${money(t.subtotal)}</span></div>${t.discount ? `<div><span>Cupón ${DEMO_COUPON} (10 % demo)</span><span>− ${money(t.discount)}</span></div>` : ''}
  <form data-form="coupon" class="coupon-form"><label for="couponCode">Cupón de demostración</label><div><input id="couponCode" maxlength="24" value="${esc(S.couponCode)}" placeholder="${DEMO_COUPON}"><button class="btn ghost sm" type="submit">Aplicar</button>${S.couponCode ? '<button class="btn ghost sm" type="button" data-act="removeCoupon">Quitar</button>' : ''}</div><p class="muted">Código de prueba: ${DEMO_COUPON} · 10 % sobre el subtotal. No es una promoción comercial.</p><p class="err" id="couponErr" role="alert"></p></form>
  <div class="total"><span>Total de demostración</span><span>${money(t.total)}</span></div>
  <button class="btn primary block" data-act="checkout">Continuar con el pedido</button><button class="btn ghost block" data-act="nav" data-v="store">Seguir comprando</button><button class="btn ghost block" data-act="clearCart">Vaciar carrito</button>
  <p class="muted" style="margin-top:10px">El pedido es solo una vista previa temporal: no se guarda en el servidor ni en el navegador, no se envía a la tienda y no procesa pagos.</p></div></div>`;
}
/* ---------- Checkout por pasos (pedido local, sin pagos) ---------- */
const CO_STEPS = ['Tus datos', 'Entrega y pago', 'Confirmar'];
const PAY = { whatsapp: 'Acordar por WhatsApp', transferencia: 'Transferencia (datos los envía la tienda)', contraentrega: 'Pago contra entrega (sujeto a confirmación)' };
const DELIVERY = { envio: 'Envío a domicilio (costo por confirmar)', recoger: 'Recoger en tienda (dirección por confirmar)' };
function checkout() {
  if (!cartItems().length) return toast('Tu carrito está vacío.', 'error');
  ui.co = ui.co || { step: 0, d: { name: '', phone: '', email: '', city: '', address: '', notes: '', delivery: 'envio', pay: 'whatsapp' }, order: null };
  ui.co.step = ui.co.order ? 3 : ui.co.step; renderCheckout();
}
function renderCheckout(err = '') {
  const co = ui.co, d = co.d, items = cartItems(), t = calc(items, S.couponCode);
  const dots = `<ol class="co-steps">${CO_STEPS.map((n, i) => `<li class="${i === co.step ? 'on' : i < co.step ? 'done' : ''}"><span>${i < co.step ? '✓' : i + 1}</span>${n}</li>`).join('')}</ol>`;
  const summary = `<div class="co-sum">${items.map((i) => `<div><span>${esc(i.name)} × ${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}${t.discount ? `<div><span>Cupón ${DEMO_COUPON}</span><span>− ${money(t.discount)}</span></div>` : ''}<div class="total"><span>Total productos</span><span>${money(t.total)}</span></div><small class="muted">El envío no está incluido: la tienda lo confirma contigo.</small></div>`;
  const field = (id, label, type = 'text', extra = '') => `<label for="co_${id}">${label}</label><input id="co_${id}" type="${type}" value="${esc(d[id])}" ${extra}>`;
  const radios = (name, map) => Object.entries(map).map(([v, l]) => `<label class="co-opt"><input type="radio" name="${name}" value="${v}" ${d[name] === v ? 'checked' : ''}> ${l}</label>`).join('');
  let body = '';
  if (co.order) {
    const o = co.order;
    body = `<div class="co-done"><span class="co-check" aria-hidden="true">✓</span><h3>Vista previa ${esc(o.id)}</h3><p>Estos datos permanecen solo temporalmente en esta pestaña. No se guardó ni envió un pedido y no se procesó ningún pago.</p><div class="co-sum"><div><span>Total productos</span><span>${money(o.total)}</span></div><div><span>Entrega</span><span>${esc(DELIVERY[o.d.delivery])}</span></div><div><span>Pago</span><span>${esc(PAY[o.d.pay])}</span></div></div><div class="acts"><button class="btn ghost" data-act="coCopy">Copiar resumen</button><button class="btn primary" data-act="coWhats">Enviar por WhatsApp</button></div><button class="btn ghost block" data-act="coFinish">Volver a la tienda</button></div>`;
  } else if (co.step === 0) {
    body = `${field('name', 'Nombre completo', 'text', 'autocomplete="name" maxlength="100"')}${field('phone', 'Celular (10 dígitos)', 'tel', 'autocomplete="tel" inputmode="numeric" maxlength="10"')}${field('email', 'Correo electrónico (opcional)', 'email', 'autocomplete="email"')}`;
  } else if (co.step === 1) {
    body = `<fieldset><legend>Entrega</legend>${radios('delivery', DELIVERY)}</fieldset>${d.delivery === 'envio' ? field('city', 'Ciudad', 'text', 'autocomplete="address-level2"') + field('address', 'Dirección de entrega', 'text', 'autocomplete="street-address"') : ''}<fieldset><legend>Forma de pago preferida</legend>${radios('pay', PAY)}<small class="muted">Aquí no se cobra nada: es solo tu preferencia para que la tienda te contacte.</small></fieldset><label for="co_notes">Notas (opcional)</label><input id="co_notes" value="${esc(d.notes)}" maxlength="200">`;
  } else {
    body = `${summary}<div class="co-sum"><div><span>Cliente</span><span>${esc(d.name)} · ${esc(d.phone)}</span></div><div><span>Entrega</span><span>${esc(DELIVERY[d.delivery])}${d.delivery === 'envio' ? ' · ' + esc(d.city + ', ' + d.address) : ''}</span></div><div><span>Pago</span><span>${esc(PAY[d.pay])}</span></div></div><p class="muted">Al confirmar solo se crea una vista previa temporal. No se guarda ni envía al servidor y no se procesa ningún pago.</p>`;
  }
  const nav = co.order ? '' : `<div class="acts"><button type="button" class="btn ghost" data-act="${co.step ? 'coBack' : 'closeModal'}">${co.step ? 'Atrás' : 'Cancelar'}</button><button class="btn primary" type="submit">${co.step === 2 ? 'Confirmar pedido' : 'Continuar'}</button></div>`;
  openModal(`<form data-form="checkout" novalidate class="co"><h3>Finalizar compra</h3>${dots}${body}<p class="err" role="alert">${esc(err)}</p>${nav}</form>`);
}
function readCheckout(form) {
  const d = ui.co.d; form.querySelectorAll('input[type=text],input[type=tel],input[type=email]').forEach((i) => { d[i.id.replace('co_', '')] = i.value.trim(); });
  form.querySelectorAll('input[type=radio]:checked').forEach((r) => { d[r.name] = r.value; });
}
function submitCheckout(form) {
  const co = ui.co; readCheckout(form); const d = co.d; let err = '';
  if (co.step === 0) err = d.name.length < 3 ? 'Escribe tu nombre completo.' : !/^\d{10}$/.test(d.phone) ? 'El celular debe tener 10 dígitos.' : d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email) ? 'El correo no es válido.' : '';
  else if (co.step === 1) err = d.delivery === 'envio' && (d.city.length < 3 || d.address.length < 5) ? 'Completa ciudad y dirección de entrega.' : '';
  if (err) return renderCheckout(err);
  if (co.step < 2) { co.step++; return renderCheckout(); }
  const items = cartItems();
  for (const i of items) { const p = getP(i.pid); if (!p || i.qty > p.stock) return renderCheckout(`${i.name}: ya no hay unidades suficientes. Ajusta tu carrito.`); }
  const order = { id: 'JM-' + String(S.nextO++).padStart(4, '0'), date: new Date().toISOString(), items, d: { ...d }, total: calc(items, S.couponCode).total, status: 'Pendiente de confirmación por la tienda' };
  S.orders.push(order); S.cart = []; S.couponCode = ''; save(); refreshChrome(); co.order = order; renderCheckout();
}
function orderText(o) {
  return `Hola JM TECH, quiero confirmar el pedido ${o.id}:\n` + o.items.map((i) => `• ${i.name} × ${i.qty} — ${money(i.price * i.qty)}`).join('\n') + `\nTotal productos: ${money(o.total)}\nCliente: ${o.d.name} (${o.d.phone})\nEntrega: ${DELIVERY[o.d.delivery]}${o.d.delivery === 'envio' ? ' — ' + o.d.city + ', ' + o.d.address : ''}\nPago: ${PAY[o.d.pay]}${o.d.notes ? '\nNotas: ' + o.d.notes : ''}`;
}

/* ---------- Funciones de descubrimiento y asistencia local ---------- */
function viewFavorites() {
  const products = S.favorites.map(getP).filter(Boolean);
  return products.length ? `<div class="products">${products.map(productCard).join('')}</div>` : '<div class="card empty"><h3>Aún no guardas favoritos</h3><p>Marca un celular con ♡ para encontrarlo aquí.</p><button class="btn primary" data-act="nav" data-v="store">Explorar catálogo</button></div>';
}
function viewCompare() {
  const products = S.compare.map(getP).filter(Boolean);
  if (products.length < 2) return `<div class="card empty"><h3>Elige al menos dos celulares</h3><p>Usa «Comparar» en las tarjetas del catálogo. Puedes comparar hasta tres productos.</p><button class="btn primary" data-act="nav" data-v="store">Explorar catálogo</button></div>${products.length ? `<div class="products compare-picks">${products.map(productCard).join('')}</div>` : ''}`;
  const row = (label, value) => `<tr><th scope="row">${label}</th>${products.map((p) => `<td>${value(p)}</td>`).join('')}</tr>`;
  return `<div class="compare-table-wrap"><table class="compare-table"><thead><tr><th scope="col">Característica</th>${products.map((p) => `<th scope="col">${esc(p.name)}<button class="link" data-act="toggleCompare" data-id="${p.id}">Quitar</button></th>`).join('')}</tr></thead><tbody>
  ${row('Marca', (p) => esc(p.brand))}${row('Precio (demo)', (p) => money(p.price))}${row('Almacenamiento', (p) => esc(p.storage || 'Sin información'))}${row('Color', (p) => esc(p.color || 'Sin información'))}${row('Estado', (p) => esc(p.condition || 'Sin información'))}${row('Disponibilidad (demo)', (p) => `${statusOf(p)[0]} · ${p.stock}`)}${row('Características declaradas', (p) => (p.features || []).map(esc).join('<br>') || 'Sin información')}
  </tbody></table></div><p class="muted demo-note">La comparación solo refleja los datos de demostración del catálogo; verifica las especificaciones antes de decidir.</p>`;
}
const assistantText = (value) => String(value || '').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function parseAssistantBudget(question) {
  const q = assistantText(question);
  if (/\b(?:un|uno)\s+millon y medio\b/.test(q)) return 1_500_000;
  if (/\b(?:un|uno)\s+millon\b/.test(q)) return 1_000_000;
  if (/\bmedio millon\b/.test(q)) return 500_000;
  const match = q.match(/(?:hasta|menos de|no mas de|maximo|presupuesto(?:\s+de)?|tope|por)\s*\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{5,}|\d+(?:[.,]\d+)?)\s*(millones?|millon|mil|m)?/);
  if (!match) return 0;
  const raw = match[1];
  const unit = match[2] || '';
  const isThousands = /^\d{1,3}(?:[.,]\d{3})+$/.test(raw);
  const number = Number(isThousands ? raw.replace(/[.,]/g, '') : raw.replace(',', '.'));
  const multiplier = unit.startsWith('millon') || unit === 'm' ? 1_000_000 : unit === 'mil' ? 1_000 : 1;
  const budget = number * multiplier;
  return Number.isFinite(budget) ? budget : 0;
}

function assistantTopics(question) {
  const q = assistantText(question);
  const topics = [];
  if (/\bfoto|\bfotografia|\bcamara|\bselfie|\bvideo/.test(q)) topics.push('fotografía');
  if (/\bjuego|\bgaming|\bjugar|\bprocesador|\brendimiento/.test(q)) topics.push('rendimiento');
  if (/\bbateria|\bautonomia|\bduracion/.test(q)) topics.push('batería');
  if (/\balmacenamiento|\bmemoria|\bespacio/.test(q)) topics.push('almacenamiento');
  if (/\bpantalla|\bver videos|\bpeliculas|\bseries/.test(q)) topics.push('pantalla');
  if (/\bestudio|\btrabajo|\bredes sociales|\buso diario/.test(q)) topics.push('uso diario');
  return topics;
}

function assistantTier(question) {
  const q = assistantText(question);
  if (/\bgama\s+baja\b|\bbarato(?:s|a|as)?\b|\beconomico(?:s|a|as)?\b/.test(q)) return 'low';
  if (/\bgama\s+media\b|\bintermedio(?:s|a|as)?\b/.test(q)) return 'medium';
  if (/\bgama\s+alta\b|\bpremium\b|\balta\s+gama\b/.test(q)) return 'high';
  return '';
}

function scoreAssistantProduct(product, topics) {
  const features = assistantText(`${product.desc || ''} ${(product.features || []).join(' ')}`);
  let score = 0;
  const reasons = [];
  const matchedTopics = [];
  topics.forEach((topic) => {
    if (topic === 'fotografía') {
      const megapixels = features.match(/(\d+(?:[.,]\d+)?)\s*mp\b/);
      if (/camara|fotografia|foto|video|zoom|estabilizacion/.test(features)) {
        score += megapixels ? 3 + Number(megapixels[1].replace(',', '.')) / 100 : 2;
        reasons.push(megapixels ? `${megapixels[1]} MP registrados` : 'características de cámara registradas');
        matchedTopics.push(topic);
      }
    } else if (topic === 'rendimiento') {
      const match = features.match(/chip\s+[a-z0-9]+|procesador|gaming|120\s*hz|144\s*hz/);
      if (match) {
        score += 2;
        reasons.push(match[0]);
        matchedTopics.push(topic);
      }
    } else if (topic === 'batería') {
      const match = features.match(/\d+\s*mah|bateria|autonomia/);
      if (match) {
        score += 2;
        reasons.push(match[0]);
        matchedTopics.push(topic);
      }
    } else if (topic === 'almacenamiento') {
      const capacity = String(product.storage || '').match(/\d+/);
      if (capacity) {
        score += Number(capacity[0]) / 100;
        reasons.push(`${product.storage} registrados`);
        matchedTopics.push(topic);
      }
    } else if (topic === 'pantalla') {
      const match = features.match(/amoled|oled|p?oled|\d+\s*hz/);
      if (match) {
        score += 2;
        reasons.push(match[0]);
        matchedTopics.push(topic);
      }
    } else if (topic === 'uso diario' && /bateria|almacenamiento|pantalla|camara|chip/.test(features)) {
      score += 1;
      reasons.push('especificaciones disponibles para revisar');
      matchedTopics.push(topic);
    }
  });
  return { score, reasons: [...new Set(reasons)], matchedTopics };
}

function answerCatalogQuestion(question) {
  const q = assistantText(question);
  const productsMentioned = S.products.filter((product) => q.includes(assistantText(product.name)));
  const brandsMentioned = [...new Set(S.products.map((product) => product.brand).filter((brand) => q.includes(assistantText(brand))))];
  const budget = parseAssistantBudget(question);
  const topics = assistantTopics(question);
  const tier = assistantTier(question);
  const compare = /\b(compar|compara|comparar|diferencia|frente a)\b/.test(q);
  let text;
  let productIds = [];
  let productReasons = {};
  const demoNotice = 'Los precios, existencias y características son datos de demostración y deben verificarse.';

  if (compare) {
    const candidates = productsMentioned.length > 1
      ? productsMentioned
      : brandsMentioned.length
        ? S.products.filter((product) => brandsMentioned.includes(product.brand))
        : [];
    if (candidates.length > 1) {
      productIds = candidates.slice(0, 3).map((product) => product.id);
      text = `Encontré ${candidates.length} modelos para comparar. Revisa sus precios, almacenamiento, color y características en las tarjetas. ${demoNotice}`;
    } else {
      text = 'Dime los nombres de dos modelos del catálogo que quieras comparar, por ejemplo: «Compara iPhone 15 y Samsung Galaxy A55».';
    }
  } else if (productsMentioned.length === 1) {
    const product = productsMentioned[0];
    productIds = [product.id];
    const details = topics.length ? scoreAssistantProduct(product, topics) : null;
    const missingTopics = details ? topics.filter((topic) => !details.matchedTopics.includes(topic)) : [];
    const topicAnswer = details
      ? `${details.matchedTopics.length ? `Para ${details.matchedTopics.join(' y ')}, el catálogo registra: ${details.reasons.join(' · ')}.` : ''}${missingTopics.length ? ` No hay datos de ${missingTopics.join(' y ')} para este modelo.` : ''}`
      : '';
    text = `${product.name}: ${money(product.price)} · ${product.stock > 0 ? `${product.stock} unidades registradas` : 'sin unidades registradas'} · ${product.storage || 'almacenamiento sin dato'} · ${product.color || 'color sin dato'}. ${topicAnswer} ${(product.features || []).join(' · ') || 'Sin características registradas.'} ${demoNotice}`;
  } else if (budget || topics.length || tier) {
    let candidates = S.products.filter((product) => product.stock > 0 && (!budget || product.price <= budget) && (!tier || tierOf(product).id === tier));
    if (topics.length) {
      const ranked = candidates.map((product) => ({ product, ...scoreAssistantProduct(product, topics) }))
        .filter((match) => match.score > 0 && topics.every((topic) => match.matchedTopics.includes(topic)))
        .sort((a, b) => b.score - a.score || a.product.price - b.product.price)
        .slice(0, 3);
      productReasons = Object.fromEntries(ranked.map((match) => [match.product.id, match.reasons.join(' · ')]));
      candidates = ranked.map((match) => match.product);
    } else {
      candidates.sort((a, b) => a.price - b.price);
      candidates = candidates.slice(0, 3);
    }
    candidates = candidates.slice(0, 3);
    if (candidates.length) {
      productIds = candidates.map((product) => product.id);
      const budgetText = budget ? ` con un presupuesto de hasta ${money(budget)}` : '';
      const tierText = tier ? ` de ${tierOf(candidates[0]).name.toLowerCase()}` : '';
      const topicText = topics.length ? ` para ${topics.join(' y ')}` : '';
      text = `Estas opciones${tierText}${budgetText}${topicText} tienen unidades registradas. Te las ordeno según la información del catálogo${topics.includes('fotografía') ? ' (los megapíxeles no determinan por sí solos la calidad de una cámara)' : ''}. Las gamas son orientativas y se calculan solo por precio de demostración. ${demoNotice}`;
      productReasons = Object.fromEntries(candidates.map((product) => [product.id, topics.length ? scoreAssistantProduct(product, topics).reasons.join(' · ') || `${tierOf(product).name} por precio` : `${tierOf(product).name} por precio · ${product.storage}`]));
    } else if ((topics.length || tier) && budget) {
      text = `No encontré modelos disponibles${topics.length ? ` con datos relacionados con ${topics.join(' y ')}` : ''} hasta ${money(budget)}. Si quieres, amplía el presupuesto o pregunta por otro criterio.`;
    } else if (topics.length || tier) {
      const tierLabel = tier ? ` en ${TIERS.find((item) => item.id === tier).name.toLowerCase()}` : '';
      text = `No encontré modelos disponibles${tierLabel}${topics.length ? ` con datos relacionados con ${topics.join(' y ')}` : ''}. Prueba con otra gama o pregunta por un criterio distinto. La clasificación por gama es orientativa y usa precios de demostración.`;
    } else {
      text = `No encuentro modelos con unidades registradas hasta ${money(budget)}. Puedes ampliar el presupuesto o revisar todo el catálogo.`;
    }
  } else if (/envio|envios|garantia|devolucion|reembolso|pago|pedido/.test(q)) {
    text = 'Esta demostración no tiene políticas comerciales configuradas: no procesa pagos, envíos, pedidos ni garantías. Consulta las preguntas frecuentes antes de continuar.';
  } else if (/catalogo|modelos|celulares|telefonos|opciones|recomiend|ayuda|gama/.test(q)) {
    const candidates = brandsMentioned.length
      ? S.products.filter((product) => brandsMentioned.includes(product.brand))
      : S.products;
    productIds = candidates.slice(0, 3).map((product) => product.id);
    text = candidates.length
      ? `Puedo ayudarte a filtrar ${candidates.length} modelos del catálogo. Dime tu presupuesto, la marca o qué característica te importa más. ${demoNotice}`
      : 'No hay modelos registrados para esa marca. Puedes consultar otra marca o ver el catálogo completo.';
  } else {
    text = 'Puedo buscar modelos, comparar celulares y recomendar opciones según el presupuesto y las características registradas. Por ejemplo: «Tengo hasta $1.500.000», «Quiero buena cámara» o «Compara iPhone 15 y Galaxy A55».';
  }
  return { text, productIds, productReasons };
}
function renderChat() {
  $('#chatMessages').innerHTML = ui.chat.map((message) => {
    const recommendations = (message.productIds || []).map((id) => getP(id)).filter(Boolean);
    return `<div class="chat-message ${message.role}">${esc(message.text)}${recommendations.length ? `<div class="chat-recommendations">${recommendations.map((product) => `<button class="chat-product" data-act="detail" data-id="${product.id}"><span><b>${esc(product.name)}</b><small>${esc(message.productReasons && message.productReasons[product.id] || `${product.storage} · ${product.color}`)}</small></span><strong>${money(product.price)}</strong></button>`).join('')}</div>` : ''}</div>`;
  }).join('');
  $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
}
function viewAssistant() {
  return `<section class="assistant card"><div class="assistant-heading"><span class="assistant-orbit" aria-hidden="true"><img src="./imagenes/celulares/JMTech-mark.png" alt=""></span><div><h2>Asistente JM TECH</h2><p>Encuentra el celular ideal para lo que necesitas.</p></div></div><p class="assistant-disclaimer"><span class="tag t-demo">Asistente local</span> Recomienda con los datos del catálogo; no es una IA conectada y no inventa características.</p><div id="chatMessages" class="chat-messages" role="log" aria-live="polite" aria-label="Conversación con el asistente"></div><form data-form="assistant" class="chat-form"><label class="sr-only" for="chatInput">Pregunta sobre el catálogo</label><input id="chatInput" name="question" maxlength="500" required placeholder="Ej.: Recomiéndame gama media hasta $1.500.000"><button class="btn primary" type="submit">Consultar</button></form><div class="suggestions" aria-label="Preguntas sugeridas"><button class="btn ghost sm" data-act="suggest" data-q="Recomiéndame celulares hasta $1.500.000">💰 Por presupuesto</button><button class="btn ghost sm" data-act="suggest" data-q="¿Qué celulares hay en gama baja?">Gama baja</button><button class="btn ghost sm" data-act="suggest" data-q="Recomiéndame celulares de gama media">Gama media</button><button class="btn ghost sm" data-act="suggest" data-q="Compara iPhone 15 y Samsung Galaxy A55">⇄ Comparar dos</button></div></section>`;
}
function viewFaq() {
  return `<div class="faq-list"><details><summary>¿Los precios y existencias son reales?</summary><p>No. Son datos locales de demostración y no representan inventario ni una oferta comercial.</p></details><details><summary>¿Puedo pagar o hacer un pedido?</summary><p>No. El carrito permite probar la interfaz, pero no se crea un pedido, no se modifica el inventario y no se procesan pagos.</p></details><details><summary>¿Cuáles son las políticas de envío, garantía y devoluciones?</summary><p>Aún no están configuradas. No se debe publicar la tienda hasta definirlas y conectarlas a un backend.</p></details><details><summary>¿El asistente utiliza inteligencia artificial?</summary><p>No. La demostración responde con coincidencias del catálogo en este navegador. Para conectar un proveedor se requiere un backend y una clave privada protegida.</p></details></div>`;
}
function viewAbout() {
  return `<section class="about-panel card"><span class="pill">Tecnología a otro nivel</span><h2>La tecnología, más cerca de ti.</h2><p>JM TECH es una experiencia de tienda de celulares creada para explorar modelos, comparar características y descubrir opciones en un solo lugar.</p><p>Esta versión es una demostración local: catálogo, precios y existencias son ilustrativos; no se reciben pedidos ni pagos. Las fotografías disponibles incluyen su atribución y fuente.</p><button class="btn primary" data-act="shopNow">Explorar el catálogo</button></section>`;
}
function viewContact() {
  return `<form class="card contact-form" data-form="contact" novalidate><p class="tag t-demo">Formulario de ejemplo: no envía ni almacena tus datos de contacto.</p><label for="contactName">Nombre</label><input id="contactName" autocomplete="name" maxlength="100" required><label for="contactEmail">Correo electrónico</label><input id="contactEmail" type="email" autocomplete="email" maxlength="150" required><label for="contactMessage">Mensaje</label><textarea id="contactMessage" rows="5" maxlength="1000" required></textarea><p class="err" id="contactErr" role="alert"></p><button class="btn primary" type="submit">Validar formulario</button></form>`;
}
function viewAccount() {
  if (!S.orders.length) return `<div class="card empty"><h3>Aún no tienes pedidos</h3><p>El checkout solo genera una vista previa temporal; no guarda pedidos.</p><button class="btn primary" data-act="nav" data-v="store">Volver a la tienda</button></div>`;
  return `<div class="orders">${[...S.orders].reverse().map((o) => `<article class="card"><div class="sec-head"><h3>${esc(o.id)}</h3><span class="tag t-warn">${esc(o.status)}</span></div><p class="muted">${new Date(o.date).toLocaleString('es-CO')}</p>${o.items.map((i) => `<div class="line"><span>${esc(i.name)} × ${i.qty}</span><b>${money(i.price * i.qty)}</b></div>`).join('')}<div class="total"><span>Total productos</span><span>${money(o.total)}</span></div></article>`).join('')}<p class="muted">Estos pedidos de demostración son temporales y solo visibles en esta pestaña.</p></div>`;
}

/* ---------- Panel de control ---------- */
function viewDashboard() {
  const done = S.sales.filter((s) => s.status === 'Completada').reduce((a, s) => a + s.total, 0);
  const low = S.products.filter((p) => p.stock <= LOW_STOCK).length;
  const stat = (cls, ic, n, l) => `<div class="card stat ${cls}"><span class="ico">${icon(ic)}</span><div><b>${n}</b><span class="muted">${l}</span></div></div>`;
  // Ventas de los últimos 7 días
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
  const totals = days.map((d) => S.sales.filter((s) => dateKey(s.date) === d.toLocaleDateString('es-CO')).reduce((a, s) => a + s.total, 0));
  const max = Math.max(...totals, 1);
  // Ventas por marca
  const byBrand = {}; S.sales.forEach((s) => s.items.forEach((i) => { byBrand[i.brand] = (byBrand[i.brand] || 0) + i.price * i.qty; }));
  const sum = Object.values(byBrand).reduce((a, b) => a + b, 0) || 1; let acc = 0;
  const stops = Object.entries(byBrand).map(([b, v]) => { const from = acc; acc += (v / sum) * 100; return `${BRAND_COLOR[b] || '#999'} ${from}% ${acc}%`; }).join(',');
  const sold = {};
  S.sales.forEach((sale) => sale.items.forEach((item) => {
    const key = `${item.pid}:${item.name}`;
    sold[key] = { name: item.name, units: (sold[key] ? sold[key].units : 0) + item.qty };
  }));
  const bestSellers = Object.values(sold).sort((a, b) => b.units - a.units).slice(0, 5);
  return `<p class="demo-banner">Panel de demostración protegido por sesión del servidor. Los precios e inventario son ilustrativos; productos, clientes y ventas se guardan en la base de datos local del servidor.</p><div class="grid g4">${stat('ok', 'money', money(done), 'Ventas de demostración')}${stat('', 'box', S.products.length, 'Productos registrados')}${stat('', 'users', S.clients.length, 'Clientes locales')}${stat('warn', 'bell', low, 'Productos con stock bajo (demo)')}</div>
  <div class="grid g2" style="margin:18px 0"><div class="card"><h3>Ventas de los últimos 7 días</h3><div class="bars">${totals.map((t, i) => `<div title="${money(t)}"><i style="height:${(t / max) * 130}px"></i>${days[i].toLocaleDateString('es-CO', { weekday: 'short' })}</div>`).join('')}</div></div>
  <div class="card"><h3>Ventas por marca</h3><div class="pie"><div class="disc" style="background:conic-gradient(${stops || '#E2E8F2 0 100%'})"></div><ul>${Object.entries(byBrand).map(([b, v]) => `<li><span class="dot" style="background:${BRAND_COLOR[b] || '#667085'}"></span>${esc(b)}: ${money(v)}</li>`).join('') || '<li>Sin ventas todavía</li>'}</ul></div></div></div>
  <div class="card best-sellers"><h3>Productos más vendidos (demo)</h3>${bestSellers.length ? `<ol>${bestSellers.map((item) => `<li><span>${esc(item.name)}</span><b>${item.units} uds.</b></li>`).join('')}</ol>` : '<p class="muted">Aún no hay ventas registradas.</p>'}</div>
  <div class="card"><h3 style="margin-bottom:8px">Últimas ventas</h3>${salesTable([...S.sales].reverse().slice(0, 5))}</div>`;
}
function salesTable(list) {
  if (!list.length) return '<div class="empty">Aún no hay ventas registradas.</div>';
  return `<div class="tbl"><table><thead><tr><th>N.º</th><th>Cliente</th><th>Producto</th><th>Fecha</th><th>Total</th><th>Estado</th></tr></thead><tbody>${list.map((s) => `<tr><td>#${s.id}</td><td>${esc(s.client)}</td><td>${esc(s.items.map((i) => `${i.name} ×${i.qty}`).join(', '))}</td><td>${dateKey(s.date)}</td><td>${money(s.total)}</td><td><span class="tag ${s.status === 'Completada' ? 't-ok' : 't-warn'}">${s.status}</span></td></tr>`).join('')}</tbody></table></div>`;
}
function viewReports() {
  return `<p class="demo-banner">Reporte local de demostración: no equivale a resultados contables ni a ventas verificadas.</p><div class="bar report-filters"><label for="reportStart">Desde</label><input id="reportStart" type="date" value="${esc(ui.reportStart)}"><label for="reportEnd">Hasta</label><input id="reportEnd" type="date" value="${esc(ui.reportEnd)}"><button class="btn ghost sm" data-act="clearReportDates">Limpiar fechas</button></div><div class="card" id="reportTable"></div>`;
}
function renderReports() {
  const list = S.sales.filter((sale) => {
    const date = sale.date.slice(0, 10);
    return (!ui.reportStart || date >= ui.reportStart) && (!ui.reportEnd || date <= ui.reportEnd);
  });
  $('#reportTable').innerHTML = salesTable([...list].reverse());
}

/* ---------- Productos e inventario ---------- */
function viewProducts(inventory) {
  if (inventory && !ui.pf.status) ui.pf.status = 'Stock bajo'; if (!inventory && ui.pf.status === 'Stock bajo' && ui.view === 'products') ui.pf.status = '';
  const pf = ui.pf;
  return `<div class="bar"><input type="search" id="pq" class="grow" placeholder="Buscar producto…" aria-label="Buscar producto" value="${esc(pf.q)}">
  <select id="pb" aria-label="Filtrar por marca"><option value="">Todas las marcas</option>${BRANDS.map((b) => `<option ${pf.brand === b ? 'selected' : ''}>${b}</option>`).join('')}</select>
  <select id="ps" aria-label="Filtrar por estado"><option value="">Todos los estados</option>${['Disponible', 'Stock bajo', 'Agotado'].map((s) => `<option ${pf.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
  <button class="btn primary" data-act="newP">Nuevo producto</button></div><div class="card" id="ptable"></div>`;
}
function renderProdTable() {
  const { q, brand, status } = ui.pf;
  const list = S.products.filter((p) => (p.name.toLowerCase().includes(q.toLowerCase())) && (!brand || p.brand === brand) && (!status || statusOf(p)[0] === status));
  $('#ptable').innerHTML = list.length ? `<div class="tbl"><table><thead><tr><th>ID</th><th>Imagen</th><th>Nombre</th><th>Marca</th><th>Precio</th><th>Cantidad</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${list.map((p) => { const [l, c] = statusOf(p); return `<tr class="${p.stock <= LOW_STOCK ? 'low' : ''}"><td>${p.id}</td><td><span class="mini">${phoneVisual(p)}</span></td><td>${esc(p.name)} <span class="muted">${esc(p.storage)}</span></td><td>${esc(p.brand)}</td><td>${money(p.price)}</td><td>${p.stock}</td><td><span class="tag ${c}">${l}</span></td><td><button class="btn ghost sm" data-act="editP" data-id="${p.id}">Editar</button> <button class="btn danger sm" data-act="delP" data-id="${p.id}">Eliminar</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">No hay productos con esos filtros.</div>';
}
function productForm(p) {
  p = p || { name: '', brand: 'Apple', storage: '', price: '', stock: '', color: '', condition: 'Nuevo', desc: '', features: [], image: '', imageSource: '', imageCredit: '', imageLicense: '', oldPrice: '', oldPriceSource: '' };
  openModal(`<form data-form="product" data-id="${p.id || ''}" novalidate><h3>${p.id ? 'Editar' : 'Nuevo'} producto</h3>
  <label for="fn">Nombre del celular</label><input id="fn" value="${esc(p.name)}"><label for="fb">Marca</label><select id="fb">${BRANDS.map((b) => `<option ${p.brand === b ? 'selected' : ''}>${b}</option>`).join('')}</select>
  <label for="fs">Almacenamiento (ej. 128 GB)</label><input id="fs" value="${esc(p.storage)}"><label for="fp">Precio (COP)</label><input id="fp" type="number" min="1" step="1000" value="${p.price}">
  <label for="fq">Cantidad disponible (demostración local)</label><input id="fq" type="number" min="0" step="1" value="${p.stock}"><label for="fc">Color</label><input id="fc" value="${esc(p.color)}">
  <label for="fcondition">Estado</label><select id="fcondition"><option ${p.condition === 'Nuevo' ? 'selected' : ''}>Nuevo</option><option ${p.condition === 'Reacondicionado' ? 'selected' : ''}>Reacondicionado</option></select>
  <label for="fdesc">Descripción</label><textarea id="fdesc" rows="3">${esc(p.desc || '')}</textarea><label for="ffeatures">Características (separadas por coma)</label><input id="ffeatures" value="${esc((p.features || []).join(', '))}">
  <label for="fimage">Ruta de imagen (./imagenes/archivo.jpg) o enlace HTTPS</label><input id="fimage" type="url" value="${esc(p.image || '')}" placeholder="./imagenes/modelo.jpg">
  <label for="fsource">Fuente oficial/autorizada de la imagen (enlace HTTPS)</label><input id="fsource" type="url" value="${esc(p.imageSource || '')}" placeholder="https://fabricante.example/producto">
  <label for="fcredit">Atribución de la imagen</label><input id="fcredit" value="${esc(p.imageCredit || '')}" placeholder="Autor · licencia">
  <label for="flicense">Enlace a la licencia (opcional, HTTPS)</label><input id="flicense" type="url" value="${esc(p.imageLicense || '')}" placeholder="https://creativecommons.org/licenses/by-sa/4.0/">
  <label for="fo">Precio anterior (opcional)</label><input id="fo" type="number" min="1" step="1000" value="${p.oldPrice || ''}">
  <label for="fosource">Fuente HTTPS del precio anterior</label><input id="fosource" type="url" value="${esc(p.oldPriceSource || '')}" placeholder="https://fuente-verificable.example">
  <p class="muted">Confirma que la imagen corresponde al modelo exacto y tienes permiso de uso. Un descuento solo aparece si agregas un precio anterior mayor al actual y su fuente HTTPS.</p><p class="err" id="ferr" role="alert"></p>
  <div class="acts"><button type="button" class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`);
}
function safeLocalImage(image) {
  if (!image.startsWith('./imagenes/') || image.includes('\\')) return false;
  try {
    const decoded = decodeURIComponent(image);
    return !decoded.includes('..') && !decoded.includes('?') && !decoded.includes('#');
  } catch {
    return false;
  }
}
function saveProduct(form) {
  const v = (id) => form.querySelector(id).value.trim(); const id = Number(form.dataset.id);
  const price = Number(v('#fp')), stock = Number(v('#fq')), oldPrice = v('#fo') === '' ? undefined : Number(v('#fo')); let err = '';
  const image = v('#fimage'), imageSource = v('#fsource'), imageLicense = v('#flicense');
  const safeImage = !image || safeLocalImage(image) || /^https:\/\/[^\s]+$/i.test(image);
  const safeSource = !imageSource || /^https:\/\/[^\s]+$/i.test(imageSource);
  const safeLicense = !imageLicense || /^https:\/\/[^\s]+$/i.test(imageLicense);
  const oldPriceSource = v('#fosource');
  const safeOldPriceSource = !oldPriceSource || /^https:\/\/[^\s]+$/i.test(oldPriceSource);
  const features = v('#ffeatures').split(',').map((feature) => feature.trim()).filter(Boolean);
  if (!v('#fn') || v('#fn').length > 120 || !v('#fs') || v('#fs').length > 40) err = 'Completa el nombre y el almacenamiento con una longitud válida.';
  else if (!Number.isSafeInteger(price) || price < 1 || price > 1_000_000_000) err = 'El precio debe ser un número entero mayor que cero.';
  else if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000 || v('#fq') === '') err = 'La cantidad debe ser un entero entre 0 y 1.000.000.';
  else if (!v('#fc')) err = 'Escribe el color.';
  else if (v('#fc').length > 60 || v('#fcondition').length > 40 || v('#fdesc').length > 2000) err = 'El color, el estado o la descripción superan la longitud permitida.';
  else if (features.length > 30 || features.some((feature) => feature.length > 200)) err = 'Agrega hasta 30 características de máximo 200 caracteres cada una.';
  else if (!safeImage) err = 'La imagen debe ser una ruta local ./imagenes/ o un enlace HTTPS.';
  else if (image.length > 2048 || imageSource.length > 2048 || imageLicense.length > 2048 || v('#fcredit').length > 200) err = 'Los datos de la imagen superan la longitud permitida.';
  else if (!safeSource) err = 'La fuente de la imagen debe ser un enlace HTTPS.';
  else if (image && !imageSource) err = 'Agrega la fuente oficial o autorizada de la imagen.';
  else if (!safeLicense) err = 'La licencia de la imagen debe ser un enlace HTTPS.';
  else if (oldPrice !== undefined && (!Number.isSafeInteger(oldPrice) || oldPrice <= price || oldPrice > 1_000_000_000)) err = 'El precio anterior debe ser un entero mayor al precio actual.';
  else if (!safeOldPriceSource) err = 'La fuente del precio anterior debe ser un enlace HTTPS.';
  else if (oldPrice !== undefined && !oldPriceSource) err = 'Agrega la fuente del precio anterior para mostrar un descuento.';
  else if (oldPrice === undefined && oldPriceSource) err = 'Agrega también el precio anterior o elimina su fuente.';
  if (err) { form.querySelector('#ferr').textContent = err; return; }
  const data = {
    name: v('#fn'), brand: v('#fb'), storage: v('#fs'), price, stock, color: v('#fc'),
    condition: v('#fcondition'), desc: v('#fdesc') || 'Descripción pendiente de verificar.',
    features,
    image, imageSource, imageCredit: v('#fcredit'), imageLicense, oldPrice, oldPriceSource
  };
  if (id) Object.assign(getP(id), data); else S.products.push({ id: S.nextP++, ...data });
  save(); closeModal(); toast(id ? 'Producto actualizado.' : 'Producto creado.'); show(ui.view);
}

/* ---------- Registro manual de ventas ---------- */
function viewSales() {
  return `<p class="demo-banner">Registro de ventas de demostración: no crea ventas reales; el historial queda en la base de datos local del servidor y solo lo consulta el administrador autenticado.</p><div class="split"><div class="card"><div class="bar"><input type="search" id="dqIn" class="grow" placeholder="Buscar producto…" aria-label="Buscar producto" value="${esc(ui.dq)}"></div><div id="plist"></div></div>
  <div class="card sum" id="psum"></div></div>`;
}
function renderDraft() {
  const q = ui.dq.toLowerCase(); const avail = S.products.filter((p) => p.stock > 0 && p.name.toLowerCase().includes(q));
  $('#plist').innerHTML = avail.length ? avail.map((p) => `<div class="line"><span class="mini">${imagePlaceholder(p.brand)}</span><div class="info"><b>${esc(p.name)}</b><div class="muted">${money(p.price)} · ${p.stock} disp.</div></div>
  <div class="qty"><button class="btn ghost sm" data-act="dr" data-id="${p.id}" data-d="-1" aria-label="Disminuir">−</button><b>${ui.draft[p.id] || 0}</b><button class="btn ghost sm" data-act="dr" data-id="${p.id}" data-d="1" aria-label="Aumentar">+</button></div></div>`).join('') : '<div class="empty">No hay productos disponibles con ese criterio.</div>';
  const items = Object.entries(ui.draft).filter(([id]) => getP(Number(id))).map(([id, qty]) => { const p = getP(Number(id)); return { pid: p.id, name: p.name, brand: p.brand, price: p.price, qty }; });
  const t = calc(items);
  $('#psum').innerHTML = `<h3>Resumen de la venta</h3>${items.map((i) => `<div><span>${esc(i.name)} ×${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join('') || '<p class="muted">Aún no seleccionas productos.</p>'}
  <div><span>Subtotal</span><span>${money(t.subtotal)}</span></div><div><span>Descuento</span><span>− ${money(t.discount)}</span></div><div class="total"><span>Total</span><span>${money(t.total)}</span></div>
  <label for="scl" style="font-weight:600">Cliente</label><select id="scl"><option value="0">Cliente de mostrador</option>${S.clients.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
  <label for="smt" style="font-weight:600;display:block;margin-top:8px">Método de pago</label><select id="smt"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option></select>
  <button class="btn primary block" data-act="confirmSale">Confirmar venta</button><button class="btn ghost block" data-act="clearDraft">Limpiar</button>`;
}
function confirmSale() {
  const items = Object.entries(ui.draft).filter(([id]) => getP(Number(id))).map(([id, qty]) => { const p = getP(Number(id)); return { pid: p.id, name: p.name, brand: p.brand, price: p.price, qty }; });
  const cid = Number($('#scl').value); const client = cid ? S.clients.find((c) => c.id === cid).name : 'Cliente de mostrador';
  const err = commitSale(items, cid, client, $('#smt').value, 'Completada');
  if (err) return toast(err, 'error');
  ui.draft = {}; toast('Venta registrada y stock actualizado.'); renderDraft();
}

/* ---------- Clientes ---------- */
function viewClients() { return `<div class="bar"><input type="search" id="cqIn" class="grow" placeholder="Buscar cliente…" aria-label="Buscar cliente" value="${esc(ui.cq)}"><button class="btn primary" data-act="newC">Nuevo cliente</button></div><div class="card" id="ctable"></div>`; }
function renderClientTable() {
  const q = ui.cq.toLowerCase(); const list = S.clients.filter((c) => (c.name + c.email).toLowerCase().includes(q));
  $('#ctable').innerHTML = list.length ? `<div class="tbl"><table><thead><tr><th>ID</th><th>Nombre completo</th><th>Correo</th><th>Teléfono</th><th>Registro</th><th>Compras</th><th>Acciones</th></tr></thead><tbody>${list.map((c) => `<tr><td>${c.id}</td><td>${esc(c.name)}</td><td>${esc(c.email)}</td><td>${esc(c.phone)}</td><td>${dateKey(c.created)}</td><td>${salesCount(c.id)}</td><td><button class="btn ghost sm" data-act="editC" data-id="${c.id}">Editar</button> <button class="btn danger sm" data-act="delC" data-id="${c.id}">Eliminar</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No hay clientes con ese criterio.</div>';
}
function clientForm(c) {
  c = c || { name: '', email: '', phone: '' };
  openModal(`<form data-form="client" data-id="${c.id || ''}" novalidate><h3>${c.id ? 'Editar' : 'Nuevo'} cliente</h3>
  <label for="cn">Nombre completo</label><input id="cn" value="${esc(c.name)}"><label for="ce">Correo electrónico</label><input id="ce" type="email" value="${esc(c.email)}"><label for="cp">Teléfono (10 dígitos)</label><input id="cp" value="${esc(c.phone)}">
  <p class="err" id="ferr" role="alert"></p><div class="acts"><button type="button" class="btn ghost" data-act="closeModal">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`);
}
function saveClient(form) {
  const v = (id) => form.querySelector(id).value.trim(); const id = Number(form.dataset.id); let err = '';
  if (v('#cn').length < 3) err = 'Escribe el nombre completo.';
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('#ce'))) err = 'Escribe un correo válido.';
  else if (!/^\d{10}$/.test(v('#cp'))) err = 'El teléfono debe tener 10 dígitos.';
  if (err) { form.querySelector('#ferr').textContent = err; return; }
  const data = { name: v('#cn'), email: v('#ce'), phone: v('#cp') };
  if (id) { Object.assign(S.clients.find((c) => c.id === id), data); S.sales.forEach((s) => { if (s.cid === id) s.client = data.name; }); }
  else S.clients.push({ id: S.nextC++, created: new Date().toISOString(), ...data });
  save(); closeModal(); toast(id ? 'Cliente actualizado.' : 'Cliente registrado.'); show('clients');
}

/* ---------- Configuración ---------- */
const viewSettings = () => `<div class="card"><h3>Seguridad y datos de demostración</h3><p class="muted" style="margin:8px 0 14px">El inicio de sesión, la sesión administrativa y las operaciones de catálogo, clientes y ventas se validan en el servidor. Las contraseñas se guardan con hash y salt; los datos administrativos no se guardan en localStorage.</p><p class="muted" style="margin:8px 0 14px">Esta instalación local no está publicada ni procesa pagos. Antes de usarla en Internet, despliega el servidor detrás de HTTPS, configura APP_ORIGIN y TRUST_PROXY, protege el archivo .env y realiza copias de seguridad de la base de datos.</p><button class="btn danger" data-act="reset">Restaurar datos de demostración</button></div>`;

/* ---------- Eventos (delegación) ---------- */
function goCatalog() { if (ui.view !== 'store') show('store'); else { renderGrid(); refreshChrome(); } $('#catalog').scrollIntoView({ behavior: 'smooth' }); }
function sendAssistantQuestion(question) {
  const text = String(question || '').trim();
  if (!text || text.length > 500) return;
  const answer = answerCatalogQuestion(text);
  ui.chat.push({ role: 'user', text }, { role: 'assistant', text: answer.text, productIds: answer.productIds, productReasons: answer.productReasons });
  renderChat();
}
async function endAdminSession(remote = true) {
  if (remote && ui.admin && csrfToken) {
    try {
      await adminSaveQueue;
      await api('/api/auth/session', {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfToken }
      });
    } catch (error) {
      if (error.status !== 401) {
        console.error('No se pudo cerrar la sesión administrativa en el servidor.', error);
        toast('No se pudo confirmar el cierre de sesión con el servidor.', 'warn');
      }
    }
  }
  ui.admin = false;
  csrfToken = '';
  adminRevision = 0;
  ui.draft = {};
  S.clients = [];
  S.sales = [];
  try {
    S.products = await api('/api/products');
  } catch (error) {
    console.error('No se pudo cargar el catálogo público después de cerrar sesión.', error);
    toast('No se pudo actualizar el catálogo desde el servidor.', 'warn');
  }
  $('#login').hidden = true;
  $('#app').hidden = false;
  show('store');
}
const ACTIONS = {
  nav: (e) => show(e.dataset.v), menu: () => $('#side').classList.toggle('open'), shopMenu: () => { ui.shopMenuOpen = !ui.shopMenuOpen; refreshChrome(); }, closeModal,
  notif: () => { const n = S.products.filter((p) => p.stock <= LOW_STOCK); toast(n.length ? `Stock bajo: ${n.map((p) => p.name).join(', ')}` : 'No hay alertas de stock.', n.length ? 'warn' : 'ok'); },
  togglePass: (e) => { const i = $('#pass'); i.type = i.type === 'password' ? 'text' : 'password'; e.textContent = i.type === 'password' ? 'Mostrar' : 'Ocultar'; },
  login: async () => {
    const data = await api('/api/auth/csrf');
    csrfToken = data.csrfToken;
    ui.admin = false;
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#loginErr').textContent = '';
    $('#user').focus();
  },
  returnStore: () => { ui.admin = false; $('#login').hidden = true; $('#app').hidden = false; show('store'); },
  logout: () => endAdminSession(),
  home: () => { resetFilters(); show('store'); },
  faq: () => show('faq'), about: () => show('about'), contact: () => show('contact'), account: () => show('account'),
  brand: (e) => { ui.brand = e.dataset.b; ui.offers = false; goCatalog(); }, tier: (e) => { ui.f.tier = e.dataset.tier; ui.brand = 'Todos'; ui.offers = false; goCatalog(); }, offers: () => { if (!S.products.some(isOffer)) return toast('No hay ofertas con precio anterior verificado.', 'warn'); ui.brand = 'Todos'; ui.f.tier = ''; ui.offers = true; goCatalog(); },
  clearF: () => { resetFilters(); show('store'); }, shopNow: goCatalog,
  toggleFavorite: (e) => {
    const id = Number(e.dataset.id);
    S.favorites = S.favorites.includes(id) ? S.favorites.filter((item) => item !== id) : [...S.favorites, id];
    save(); refreshChrome(); show(ui.view, ui.view === 'detail' ? ui.detailId : undefined);
  },
  toggleCompare: (e) => {
    const id = Number(e.dataset.id);
    if (S.compare.includes(id)) S.compare = S.compare.filter((item) => item !== id);
    else if (S.compare.length >= 3) return toast('Puedes comparar hasta tres celulares.', 'warn');
    else S.compare.push(id);
    save(); refreshChrome(); show(ui.view, ui.view === 'detail' ? ui.detailId : undefined);
  },
  suggest: (e) => sendAssistantQuestion(e.dataset.q),
  removeCoupon: () => { S.couponCode = ''; save(); show('cart'); },
  clearReportDates: () => { ui.reportStart = ''; ui.reportEnd = ''; show('reports'); },
  whatsapp: () => {
    if (!/^\d{10,15}$/.test(WHATSAPP_NUMBER)) return toast('WhatsApp no está configurado. Define WHATSAPP_NUMBER en script.js con el indicativo del país y el número, solo dígitos.', 'warn');
    window.open(`https://wa.me/${WHATSAPP_NUMBER}`, '_blank', 'noopener,noreferrer');
  },
  consult: (e) => consultForm(e.dataset.id ? getP(Number(e.dataset.id)) : null),
  detail: (e) => { ui.detailQty = 1; show('detail', Number(e.dataset.id)); }, add: (e) => addToCart(Number(e.dataset.id)),
  dq: (e) => { const p = getP(ui.detailId); ui.detailQty = Math.max(1, Math.min(p.stock, ui.detailQty + Number(e.dataset.d))); $('#dqty').textContent = ui.detailQty; },
  addDetail: () => addToCart(ui.detailId, ui.detailQty), buyNow: () => { if (addToCart(ui.detailId, ui.detailQty)) show('cart'); },
  cq: (e) => { const l = S.cart.find((c) => c.pid === Number(e.dataset.id)); const n = l.qty + Number(e.dataset.d); if (n < 1) return; if (n > getP(l.pid).stock) return toast('No hay más unidades disponibles.', 'warn'); l.qty = n; save(); show('cart'); },
  cdel: (e) => { S.cart = S.cart.filter((c) => c.pid !== Number(e.dataset.id)); save(); show('cart'); toast('Producto eliminado del carrito.', 'warn'); },
  clearCart: () => confirmBox('¿Vaciar todo el carrito?', () => { S.cart = []; save(); show('cart'); }, 'Vaciar'),
  checkout, doneCheckout: () => { closeModal(); show('store'); },
  coBack: () => { readCheckout($('form.co')); ui.co.step = Math.max(0, ui.co.step - 1); renderCheckout(); },
  coFinish: () => { ui.co = null; closeModal(); show('store'); },
  coCopy: () => { const t = orderText(ui.co.order); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Resumen copiado.'), () => toast('No se pudo copiar automáticamente.', 'warn')); },
  coWhats: () => {
    if (!/^\d{10,15}$/.test(WHATSAPP_NUMBER)) return toast('Falta configurar WHATSAPP_NUMBER en script.js. Mientras tanto usa «Copiar resumen».', 'warn');
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(orderText(ui.co.order))}`, '_blank', 'noopener,noreferrer');
  },
  newP: () => productForm(), editP: (e) => productForm(getP(Number(e.dataset.id))),
  delP: (e) => { const p = getP(Number(e.dataset.id)); confirmBox(`¿Eliminar "${p.name}"? Las ventas registradas conservarán su historial.`, () => { S.products = S.products.filter((x) => x.id !== p.id); S.cart = S.cart.filter((c) => c.pid !== p.id); S.favorites = S.favorites.filter((id) => id !== p.id); S.compare = S.compare.filter((id) => id !== p.id); S.recent = S.recent.filter((id) => id !== p.id); delete ui.draft[p.id]; save(); show(ui.view); toast('Producto eliminado.', 'warn'); }); },
  dr: (e) => { const p = getP(Number(e.dataset.id)); const n = (ui.draft[p.id] || 0) + Number(e.dataset.d); if (n < 0) return; if (n > p.stock) return toast(`Solo hay ${p.stock} unidades.`, 'warn'); if (n === 0) delete ui.draft[p.id]; else ui.draft[p.id] = n; renderDraft(); },
  clearDraft: () => { ui.draft = {}; renderDraft(); }, confirmSale,
  newC: () => clientForm(), editC: (e) => clientForm(S.clients.find((c) => c.id === Number(e.dataset.id))),
  delC: (e) => { const c = S.clients.find((x) => x.id === Number(e.dataset.id)); confirmBox(`¿Eliminar a ${c.name}?`, () => { S.clients = S.clients.filter((x) => x.id !== c.id); save(); show('clients'); toast('Cliente eliminado.', 'warn'); }); },
  confirmYes: () => { const cb = ui.confirmCb; closeModal(); if (cb) cb(); },
  reset: () => confirmBox('¿Restaurar los datos de demostración? Se perderán los cambios.', () => { localStorage.removeItem(KEY); S = seedData(); ui.draft = {}; save(); show('dashboard'); toast('Datos restaurados.'); }, 'Restaurar')
};
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || !ACTIONS[el.dataset.act]) return;
  try {
    await ACTIONS[el.dataset.act](el);
  } catch (error) {
    console.error(`No se pudo completar la acción "${el.dataset.act}".`, error);
    toast(error.message || 'No se pudo completar la acción.', 'error');
  }
});
document.addEventListener('input', (ev) => {
  const id = ev.target.id;
  if (id === 'storeQ') { ui.q = ev.target.value; if (ui.view !== 'store') { show('store'); ev.target.focus(); } else { renderGrid(); refreshChrome(); } }
  else if (id === 'pq') { ui.pf.q = ev.target.value; renderProdTable(); } else if (id === 'dqIn') { ui.dq = ev.target.value; renderDraft(); } else if (id === 'cqIn') { ui.cq = ev.target.value; renderClientTable(); }
});
document.addEventListener('change', (ev) => {
  if (ev.target.name === 'delivery' && ui.co) { readCheckout(ev.target.form); renderCheckout(); return; }
  const t = ev.target, sf = { sfTier: () => { ui.f.tier = t.value; }, sfBrand: () => { ui.brand = t.value || 'Todos'; ui.offers = false; }, sfPrice: () => { ui.f.price = t.value; }, sfCap: () => { ui.f.cap = t.value; }, sfColor: () => { ui.f.color = t.value; }, sfCondition: () => { ui.f.condition = t.value; }, sfOnly: () => { ui.f.only = t.checked; }, sfSort: () => { ui.sort = t.value; } };
  if (sf[t.id]) { sf[t.id](); renderGrid(); refreshChrome(); return; }
  if (ev.target.id === 'pb') { ui.pf.brand = ev.target.value; renderProdTable(); } else if (ev.target.id === 'ps') { ui.pf.status = ev.target.value; renderProdTable(); }
  else if (ev.target.id === 'reportStart') { ui.reportStart = ev.target.value; renderReports(); } else if (ev.target.id === 'reportEnd') { ui.reportEnd = ev.target.value; renderReports(); } });
document.addEventListener('submit', async (ev) => {
  ev.preventDefault(); const f = ev.target;
  if (f.dataset.form === 'login') {
    const username = $('#user').value.trim();
    const password = $('#pass').value;
    if (!username || !password) { $('#loginErr').textContent = 'Escribe tu usuario y contraseña.'; return; }
    const submit = f.querySelector('[type="submit"]');
    submit.disabled = true;
    $('#loginErr').textContent = '';
    try {
      const auth = await api('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ username, password })
      });
      csrfToken = auth.csrfToken;
      if (legacyAdminState) {
        try {
          await api('/api/admin/import-local', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(legacyAdminState)
          });
          legacyAdminState = null;
        } catch (migrationError) {
          if (migrationError.status !== 400 && migrationError.status !== 409) throw migrationError;
          console.error('Los datos locales no se pudieron importar al servidor.', migrationError);
          toast(`No se importaron los datos anteriores: ${migrationError.message}. Se conservaron en este navegador.`, 'warn');
        }
      }
      applyAdminState(await api('/api/admin/state'));
      if (!legacyAdminState) {
        saveGuestData();
        if (legacyOrdersPresent) toast('Los pedidos locales de demostración no se migraron; no son pedidos comerciales.', 'warn');
        legacyOrdersPresent = false;
      }
      $('#pass').value = '';
      enter(true);
    } catch (error) {
      $('#pass').value = '';
      $('#loginErr').textContent = error.message || 'No se pudo iniciar sesión.';
      if (error.status === 403) csrfToken = '';
    } finally {
      submit.disabled = false;
    }
  }
  else if (f.dataset.form === 'checkout') submitCheckout(f); else if (f.dataset.form === 'product') saveProduct(f); else if (f.dataset.form === 'client') saveClient(f);
  else if (f.dataset.form === 'assistant') { const input = f.querySelector('#chatInput'); sendAssistantQuestion(input.value); input.value = ''; input.focus(); }
  else if (f.dataset.form === 'coupon') {
    const code = f.querySelector('#couponCode').value.trim().toUpperCase();
    if (![DEMO_COUPON, 'TECHNOVA10', 'NEXORA10', 'ORBITA10'].includes(code)) { f.querySelector('#couponErr').textContent = `Cupón inválido. Prueba ${DEMO_COUPON} (solo demostración).`; return; }
    S.couponCode = DEMO_COUPON; save(); show('cart'); toast('Cupón de demostración aplicado.');
  }
  else if (f.dataset.form === 'contact') {
    const name = f.querySelector('#contactName').value.trim(), email = f.querySelector('#contactEmail').value.trim(), message = f.querySelector('#contactMessage').value.trim();
    const error = !name || name.length < 3 ? 'Escribe un nombre de al menos 3 caracteres.' : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? 'Escribe un correo válido.' : !message ? 'Escribe un mensaje.' : '';
    f.querySelector('#contactErr').textContent = error;
    if (!error) { f.reset(); toast('Formulario validado. No se envió ningún dato porque no hay servidor conectado.', 'ok'); }
  }
  else if (f.dataset.form === 'consult') { const v = (i) => f.querySelector(i).value.trim(); if (v('#kn').length < 3 || !v('#kc') || !v('#km')) { f.querySelector('#ferr').textContent = 'Completa tu nombre, un medio de contacto y el mensaje.'; return; } closeModal(); toast('Formulario validado. No se envió la consulta: falta conectar un servidor.', 'warn'); }
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeModal(); });

function enter(admin) { ui.admin = admin; $('#login').hidden = true; $('#app').hidden = false; $('#bellIc').outerHTML = icon('bell').replace('<svg', '<svg id="bellIc"'); $('#cartIc').outerHTML = icon('cart').replace('<svg', '<svg id="cartIc"'); show(admin ? 'dashboard' : 'store'); }

async function initialize() {
  $('#bellIc').outerHTML = icon('bell').replace('<svg', '<svg id="bellIc"');
  $('#cartIc').outerHTML = icon('cart').replace('<svg', '<svg id="cartIc"');
  try {
    S.products = await api('/api/products');
    const auth = await api('/api/auth/session');
    if (auth.authenticated) {
      csrfToken = auth.csrfToken;
      applyAdminState(await api('/api/admin/state'));
      enter(true);
    } else {
      show('store');
    }
  } catch (error) {
    console.error('No se pudo conectar con el servidor seguro de JM TECH.', error);
    $('#title').textContent = 'Servidor no disponible';
    $('#subtitle').textContent = 'Abre JM TECH desde el servidor local para continuar.';
    $('#view').innerHTML = '<section class="card"><h2>No se pudo conectar con JM TECH</h2><p>Inicia el servidor con <code>npm start</code> y vuelve a abrir esta página en <code>http://localhost:3000</code>. No uses la tienda como archivo local: el acceso administrativo y el catálogo ahora requieren el servidor.</p></section>';
    refreshChrome();
  }
}

initialize();
