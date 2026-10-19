'use strict';

const API_URL = '/facturas';
const state = { invoices: [], history: [], filter: 'todos', search: '' };
const elements = {
  rows: document.querySelector('#invoiceRows'), empty: document.querySelector('#emptyState'),
  refresh: document.querySelector('#refreshButton'), updated: document.querySelector('#lastUpdated'),
  search: document.querySelector('#searchInput'), formPanel: document.querySelector('#invoiceFormPanel'),
  form: document.querySelector('#invoiceForm'), formMessage: document.querySelector('#formMessage'),
  toggleForm: document.querySelector('#toggleFormButton'), closeForm: document.querySelector('#closeFormButton'),
  toast: document.querySelector('#toast'),
};

function currency(value, code = 'CRC') {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: code || 'CRC', maximumFractionDigits: 2 }).format(Number(value) || 0);
}
function dateLabel(value) {
  if (!value) return 'Por calcular';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, day)));
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
function summary() {
  const byState = (name) => state.invoices.filter((invoice) => invoice.estado === name);
  const open = state.invoices.filter((invoice) => ['pendiente', 'vencida'].includes(invoice.estado));
  const amount = (list) => list.reduce((total, invoice) => total + (Number(invoice.monto) || 0), 0);
  const pending = byState('pendiente'); const overdue = byState('vencida'); const paid = byState('pagada');
  document.querySelector('#totalPending').textContent = currency(amount(open));
  document.querySelector('#overdueCount').textContent = overdue.length;
  document.querySelector('#overdueAmount').textContent = currency(amount(overdue));
  document.querySelector('#pendingCount').textContent = pending.length;
  document.querySelector('#pendingAmount').textContent = currency(amount(pending));
  document.querySelector('#paidCount').textContent = paid.length;
  document.querySelector('#paidAmount').textContent = currency(amount(paid));
}
function renderTrend() {
  const history = [...state.history].sort((a, b) => String(a.fechaEjecucion).localeCompare(String(b.fechaEjecucion)));
  const latest = history.at(-1);
  const badge = document.querySelector('#trendBadge');
  const chart = document.querySelector('#trendChart');
  document.querySelector('#trendRuns').textContent = history.length;
  if (!latest) {
    badge.textContent = 'Sin datos'; badge.className = 'trend-badge trend-sin-datos';
    document.querySelector('#trendConclusion').textContent = 'Ejecuta el workflow actualizado para crear la primera medicion.';
    document.querySelector('#trendDate').textContent = '--'; document.querySelector('#trendAmount').textContent = '--';
    chart.innerHTML = '<span class="trend-chart-empty">Todavia no hay ejecuciones registradas.</span>'; return;
  }
  const trend = String(latest.tendencia || 'SIN_DATOS');
  badge.textContent = trend.replaceAll('_', ' ');
  badge.className = `trend-badge trend-${trend.toLocaleLowerCase().replaceAll('_', '-')}`;
  document.querySelector('#trendConclusion').textContent = latest.conclusion || 'Ejecucion registrada correctamente.';
  document.querySelector('#trendDate').textContent = new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(latest.fechaEjecucion));
  document.querySelector('#trendAmount').textContent = currency(latest.montoVencido);
  const recent = history.slice(-6); const max = Math.max(...recent.map((item) => Number(item.montoVencido) || 0), 1);
  chart.innerHTML = recent.map((item) => {
    const amount = Math.max(0, Number(item.montoVencido) || 0); const height = Math.max(5, Math.round((amount / max) * 100));
    const label = new Intl.DateTimeFormat('es-CR', { day: '2-digit', month: 'short' }).format(new Date(item.fechaEjecucion));
    return `<span class="trend-bar" style="height:${height}%" data-label="${escapeHtml(label)}" title="${escapeHtml(currency(amount))}"></span>`;
  }).join('');
}
function visibleInvoices() {
  const term = state.search.trim().toLocaleLowerCase('es');
  return state.invoices.filter((invoice) => {
    const matchesState = state.filter === 'todos' || invoice.estado === state.filter;
    const haystack = `${invoice.id ?? ''} ${invoice.cliente ?? ''}`.toLocaleLowerCase('es');
    return matchesState && (!term || haystack.includes(term));
  });
}
function render() {
  summary(); renderTrend(); const invoices = visibleInvoices(); elements.empty.hidden = invoices.length > 0;
  elements.rows.innerHTML = invoices.map((invoice) => {
    const canPay = ['pendiente', 'vencida'].includes(invoice.estado);
    return `<tr><td class="invoice-id">${escapeHtml(invoice.id)}</td><td><span class="client-name">${escapeHtml(invoice.cliente || 'Sin nombre')}</span></td><td class="muted">${escapeHtml(dateLabel(invoice.fechaEmision))}</td><td class="muted">${escapeHtml(dateLabel(invoice.fechaVencimiento))}</td><td class="amount">${escapeHtml(currency(invoice.monto, invoice.moneda))}</td><td><span class="badge badge-${escapeHtml(invoice.estado)}">${escapeHtml(invoice.estado)}</span></td><td>${canPay ? `<button class="action-button" type="button" data-pay="${escapeHtml(invoice.id)}">Marcar pagada</button>` : ''}</td></tr>`;
  }).join('');
}
function showToast(message) {
  elements.toast.textContent = message; elements.toast.classList.add('show'); window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => elements.toast.classList.remove('show'), 3200);
}
async function loadInvoices({ announce = false } = {}) {
  elements.refresh.disabled = true; elements.refresh.textContent = 'Actualizando...';
  try {
    const [invoiceResponse, historyResponse] = await Promise.all([
      fetch(API_URL, { headers: { Accept: 'application/json' } }),
      fetch('/historial', { headers: { Accept: 'application/json' } })
    ]);
    if (!invoiceResponse.ok || !historyResponse.ok) throw new Error('No se pudieron leer todos los datos');
    [state.invoices, state.history] = await Promise.all([invoiceResponse.json(), historyResponse.json()]); render();
    elements.updated.textContent = `Actualizado ${new Intl.DateTimeFormat('es-CR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
    if (announce) showToast('Datos actualizados correctamente.');
  } catch (error) {
    elements.updated.textContent = 'JSON Server sin conexion'; showToast('No se pudo conectar con la base de facturas.');
  } finally { elements.refresh.disabled = false; elements.refresh.textContent = 'Actualizar datos'; }
}
function toggleForm(show) {
  elements.formPanel.hidden = !show; elements.toggleForm.setAttribute('aria-expanded', String(show)); elements.formMessage.textContent = '';
  if (show) document.querySelector('#invoiceId').focus();
}
async function createInvoice(event) {
  event.preventDefault(); elements.formMessage.textContent = '';
  const data = Object.fromEntries(new FormData(elements.form));
  const invoice = { id: data.id.trim(), cliente: data.cliente.trim(), fechaEmision: data.fechaEmision, plazoDiasHabiles: Number(data.plazoDiasHabiles), monto: Number(data.monto), moneda: data.moneda, estado: 'pendiente', fechaVencimiento: null };
  if (state.invoices.some((item) => String(item.id).toLocaleLowerCase() === invoice.id.toLocaleLowerCase())) {
    elements.formMessage.textContent = 'Ese numero de factura ya existe.'; return;
  }
  try {
    const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoice) });
    if (!response.ok) throw new Error(`Error HTTP ${response.status}`);
    elements.form.reset(); elements.form.elements.plazoDiasHabiles.value = 15; toggleForm(false); await loadInvoices(); showToast(`Factura ${invoice.id} registrada.`);
  } catch (error) { elements.formMessage.textContent = 'No se pudo guardar. Verifica JSON Server.'; }
}
async function markPaid(id) {
  try {
    const response = await fetch(`${API_URL}/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'pagada' }) });
    if (!response.ok) throw new Error(`Error HTTP ${response.status}`);
    await loadInvoices(); showToast(`Factura ${id} marcada como pagada.`);
  } catch (error) { showToast(`No se pudo actualizar la factura ${id}.`); }
}
elements.refresh.addEventListener('click', () => loadInvoices({ announce: true }));
elements.toggleForm.addEventListener('click', () => toggleForm(elements.formPanel.hidden));
elements.closeForm.addEventListener('click', () => toggleForm(false));
elements.form.addEventListener('submit', createInvoice);
elements.search.addEventListener('input', (event) => { state.search = event.target.value; render(); });
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
  state.filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('active', item === button)); render();
}));
elements.rows.addEventListener('click', (event) => { const button = event.target.closest('[data-pay]'); if (button) markPaid(button.dataset.pay); });
loadInvoices();
