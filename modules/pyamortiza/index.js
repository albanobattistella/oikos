import { esc } from '/utils/html.js';

const STATE_KEY = 'oikos:module:pyamortiza';

const defaultState = () => ({
  activeTab: 'financing',
  activePhase: 0,
  financing: {
    simId: 1,
    propertyValue: 850000,
    downPayment: 255000,
    termMonths: 420,
    startDate: '2025-11-12',
    system: 'SAC',
    rounding: 2,
    bankName: 'CAIXA',
    effectiveAnnualRate: 0.1129,
    mipMonthlyRate: 0.0001158,
    dfiFixedMonthly: 56.10,
    dfiMonthlyRate: 0,
    otherInsuranceMonthly: 0,
    adminFeeMonthly: 25,
    mipOverrides: '',
    amortizations: [],
  },
  consortium: {
    grupo: '',
    embutido: 'Nao',
    faixaCredito: 850000,
    participantes: '',
    prazoTotal: 120,
    prazoRemanescente: 120,
    parcelaAntes: 0,
    userParcelaOverride: false,
    lanceProprioModo: 'pct',
    lanceProprio: 0,
    lanceEmbutidoModo: 'pct',
    lanceEmbutido: 0,
    lanceFixo: 0,
    lanceLivre: 0,
    totalContemplados: '',
    contempladoSorteio: '',
    cotasExcluidas: '',
    contempladoLivre: '',
    contempladoFixo: '',
    contempladosUltima: '',
    lanceMedio3: 0,
    lanceMin: 0,
    lanceMax: 0,
    csvData: '',
    selectedGroup: '',
  },
});

function loadState() {
  try {
    return { ...defaultState(), ...(JSON.parse(localStorage.getItem(STATE_KEY) || '{}')) };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function money(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function roundMoney(value, places = 2) {
  const factor = 10 ** Number(places || 2);
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function effYearToMonth(rate) {
  return (1 + Number(rate || 0)) ** (1 / 12) - 1;
}

function addMonths(dateString, months) {
  const base = new Date(`${dateString}T00:00:00`);
  const originalDay = base.getDate();
  const target = new Date(base);
  target.setMonth(target.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(originalDay, lastDay));
  return target.toISOString().slice(0, 10);
}

function monthKey(dateString) {
  return String(dateString || '').slice(0, 7);
}

function formatDateBr(dateString) {
  if (!dateString) return '';
  const [y, m, d] = dateString.split('-');
  return `${d}/${m}/${y}`;
}

function parseOverrides(text) {
  const rows = {};
  String(text || '').split(/\r?\n/).forEach((line) => {
    const cleaned = line.trim().replace(/^["']|["']$/g, '');
    if (!cleaned || cleaned.startsWith('#')) return;
    const match = cleaned.match(/^([0-9]{4}-[0-9]{2})\s*:\s*([0-9.,]+)/);
    if (!match) return;
    rows[match[1]] = Number(match[2].replace(/\./g, '').replace(',', '.'));
  });
  return rows;
}

function generateSchedule(financing, startDue, principal0, termOverride = null) {
  const n = Math.max(1, Number(termOverride || financing.termMonths || 1));
  const r = effYearToMonth(financing.effectiveAnnualRate);
  const schedule = [];
  const system = String(financing.system || 'SAC').toUpperCase();
  const overrides = parseOverrides(financing.mipOverrides);
  let balance = Number(principal0 || 0);

  if (system === 'SAC') {
    const principalConst = balance / n;
    for (let k = 1; k <= n; k++) {
      const dueDate = addMonths(startDue, k - 1);
      const interest = balance * r;
      const mip = overrides[monthKey(dueDate)] ?? balance * Number(financing.mipMonthlyRate || 0);
      const dfi = Number(financing.dfiFixedMonthly || 0) > 0
        ? Number(financing.dfiFixedMonthly || 0)
        : balance * Number(financing.dfiMonthlyRate || 0);
      const other = Number(financing.otherInsuranceMonthly || 0);
      const admin = Number(financing.adminFeeMonthly || 0);
      const installmentCore = principalConst + interest;
      const newBalance = Math.max(0, balance - principalConst);
      schedule.push({
        no: k,
        dueDate,
        installmentCore: roundMoney(installmentCore, financing.rounding),
        principal: roundMoney(principalConst, financing.rounding),
        interest: roundMoney(interest, financing.rounding),
        mip: roundMoney(mip, financing.rounding),
        dfi: roundMoney(dfi, financing.rounding),
        otherInsurance: roundMoney(other, financing.rounding),
        adminFee: roundMoney(admin, financing.rounding),
        totalCharge: roundMoney(installmentCore + mip + dfi + other + admin, financing.rounding),
        remainingBalance: roundMoney(newBalance, financing.rounding),
      });
      balance = newBalance;
    }
    return schedule;
  }

  const annuity = r === 0 ? balance / n : balance * (r * (1 + r) ** n) / ((1 + r) ** n - 1);
  for (let k = 1; k <= n; k++) {
    const dueDate = addMonths(startDue, k - 1);
    const interest = balance * r;
    const principal = annuity - interest;
    const mip = overrides[monthKey(dueDate)] ?? balance * Number(financing.mipMonthlyRate || 0);
    const dfi = Number(financing.dfiFixedMonthly || 0) > 0
      ? Number(financing.dfiFixedMonthly || 0)
      : balance * Number(financing.dfiMonthlyRate || 0);
    const other = Number(financing.otherInsuranceMonthly || 0);
    const admin = Number(financing.adminFeeMonthly || 0);
    const newBalance = Math.max(0, balance - principal);
    schedule.push({
      no: k,
      dueDate,
      installmentCore: roundMoney(annuity, financing.rounding),
      principal: roundMoney(principal, financing.rounding),
      interest: roundMoney(interest, financing.rounding),
      mip: roundMoney(mip, financing.rounding),
      dfi: roundMoney(dfi, financing.rounding),
      otherInsurance: roundMoney(other, financing.rounding),
      adminFee: roundMoney(admin, financing.rounding),
      totalCharge: roundMoney(annuity + mip + dfi + other + admin, financing.rounding),
      remainingBalance: roundMoney(newBalance, financing.rounding),
    });
    balance = newBalance;
  }
  return schedule;
}

function applyExtraAmort(schedule, amortYyyymm, amount, financing, keepTerm) {
  const paid = [];
  const remaining = [];
  schedule.forEach((row) => (monthKey(row.dueDate) <= amortYyyymm ? paid : remaining).push(row));
  if (!paid.length) throw new Error('Amortization month is before schedule start.');
  const lastPaid = paid.at(-1);
  const newBalance = Math.max(0, Number(lastPaid.remainingBalance) - Number(amount || 0));
  const newStartDue = addMonths(lastPaid.dueDate, 1);
  const remainingTerm = remaining.length;
  if (newBalance <= 0) return { schedule: [], startDue: newStartDue, balance: 0 };
  if (keepTerm) {
    return {
      schedule: generateSchedule(financing, newStartDue, newBalance, Math.max(1, remainingTerm)),
      startDue: newStartDue,
      balance: newBalance,
    };
  }

  const target = remaining[0]?.installmentCore;
  const r = effYearToMonth(financing.effectiveAnnualRate);
  let bestN = Math.max(1, remainingTerm);
  if (target) {
    let lo = 1;
    let hi = bestN;
    const isSac = String(financing.system).toUpperCase() === 'SAC';
    const annuityFor = (months) => {
      if (isSac) return (newBalance / Math.max(1, months)) + (newBalance * r);
      return r === 0 ? newBalance / Math.max(1, months) : newBalance * (r * (1 + r) ** months) / ((1 + r) ** months - 1);
    };
    for (let i = 0; i < 64; i++) {
      const mid = Math.floor((lo + hi) / 2);
      if (annuityFor(mid) > target) lo = mid + 1;
      else {
        bestN = mid;
        hi = mid - 1;
      }
    }
  }
  return {
    schedule: generateSchedule(financing, newStartDue, newBalance, bestN),
    startDue: newStartDue,
    balance: newBalance,
  };
}

function calculatePhases(financing) {
  const loanAmount = Math.max(0, Number(financing.propertyValue || 0) - Number(financing.downPayment || 0));
  const phase0 = generateSchedule(financing, financing.startDate, loanAmount);
  const phases = [{ label: 'Fase 0', rows: phase0, startDue: financing.startDate, balance: loanAmount }];
  let lastSchedule = phase0;
  let lastStartDue = financing.startDate;
  let lastBalance = loanAmount;
  financing.amortizations
    .filter((item) => Number(item.amount || 0) > 0)
    .forEach((item, index) => {
      const result = applyExtraAmort(lastSchedule, item.date, item.amount, {
        ...financing,
        startDate: lastStartDue,
        termMonths: lastSchedule.length,
      }, item.keepTerm !== false);
      phases.push({ label: `Fase ${index + 1}`, rows: result.schedule, startDue: result.startDue, balance: result.balance });
      lastSchedule = result.schedule;
      lastStartDue = result.startDue;
      lastBalance = result.balance;
    });
  return { loanAmount, phases, lastBalance };
}

function field(label, id, value, type = 'number', attrs = '') {
  return `
    <div class="form-group">
      <label class="form-label" for="${id}">${label}</label>
      <input class="form-input" id="${id}" name="${id}" type="${type}" value="${esc(value)}" ${attrs}>
    </div>
  `;
}

function selectField(label, id, value, options) {
  return `
    <div class="form-group">
      <label class="form-label" for="${id}">${label}</label>
      <select class="form-input" id="${id}" name="${id}">
        ${options.map(([optionValue, optionLabel]) => `
          <option value="${esc(optionValue)}"${String(optionValue) === String(value) ? ' selected' : ''}>${esc(optionLabel)}</option>
        `).join('')}
      </select>
    </div>
  `;
}

function metric(label, value) {
  return `<div class="pyamortiza-metric"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`;
}

function scheduleTable(rows) {
  if (!rows.length) return '<p class="form-hint">Fase vazia. Financiamento quitado.</p>';
  return `
    <div class="pyamortiza-table-wrap">
      <table class="pyamortiza-table">
        <thead>
          <tr>
            <th>No.</th><th>Vencimento</th><th>Prestacao</th><th>MIP</th><th>DFI/DFC</th>
            <th>Seguros/FGHAB</th><th>TA</th><th>Encargo</th><th>Saldo Devedor</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${row.no}</td>
              <td>${formatDateBr(row.dueDate)}</td>
              <td>${money(row.installmentCore)}</td>
              <td>${money(row.mip)}</td>
              <td>${money(row.dfi)}</td>
              <td>${money(Number(row.mip) + Number(row.dfi))}</td>
              <td>${money(row.adminFee)}</td>
              <td>${money(row.totalCharge)}</td>
              <td>${money(row.remainingBalance)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function parseDelimited(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ';';
  const headers = lines[0].split(delimiter).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(delimiter);
    return Object.fromEntries(headers.map((h, index) => [h, values[index]?.trim() ?? '']));
  });
}

function normalizeKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function findValue(row, synonyms, fallback = '') {
  const entries = Object.entries(row);
  for (const synonym of synonyms) {
    const found = entries.find(([key]) => normalizeKey(key) === normalizeKey(synonym));
    if (found) return found[1];
  }
  return fallback;
}

function numberValue(value) {
  if (typeof value === 'number') return value;
  const raw = String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function applyConsortiumCsv(consortium) {
  const rows = parseDelimited(consortium.csvData);
  if (!rows.length || !consortium.selectedGroup) return consortium;
  const row = rows.find((item) => {
    const group = findValue(item, ['grupo', 'gr', 'id grupo', 'nr_grupo', 'numero do grupo'], Object.values(item)[0]);
    return String(group).trim().toLowerCase() === String(consortium.selectedGroup).trim().toLowerCase();
  });
  if (!row) return consortium;
  return {
    ...consortium,
    grupo: findValue(row, ['grupo', 'nr_grupo', 'numero do grupo'], consortium.selectedGroup),
    embutido: /sim/i.test(findValue(row, ['embutido', 'tem embutido'], consortium.embutido)) ? 'Sim' : 'Nao',
    faixaCredito: numberValue(findValue(row, ['faixa de credito', 'faixa de crédito', 'valor da carta', 'credito'], consortium.faixaCredito)),
    participantes: findValue(row, ['participantes', 'qtd participantes'], consortium.participantes),
    prazoTotal: numberValue(findValue(row, ['prazo total', 'prazo'], consortium.prazoTotal)) || consortium.prazoTotal,
    prazoRemanescente: numberValue(findValue(row, ['prazo remanescente', 'remanescente', 'prazo rem'], consortium.prazoRemanescente)) || consortium.prazoRemanescente,
    lanceFixo: numberValue(findValue(row, ['lance fixo'], consortium.lanceFixo)),
    lanceLivre: numberValue(findValue(row, ['lance livre'], consortium.lanceLivre)),
    totalContemplados: findValue(row, ['total contemplados'], consortium.totalContemplados),
    contempladoSorteio: findValue(row, ['contemplado sorteio'], consortium.contempladoSorteio),
    cotasExcluidas: findValue(row, ['cotas excluidas', 'cotas excluídas'], consortium.cotasExcluidas),
    contempladoLivre: findValue(row, ['contemplado lance livre', 'contemplado livre'], consortium.contempladoLivre),
    contempladoFixo: findValue(row, ['contemplado lance fixo', 'contemplado fixo'], consortium.contempladoFixo),
    contempladosUltima: findValue(row, ['contemplados ultima ass', 'contemplados última ass'], consortium.contempladosUltima),
    lanceMedio3: numberValue(findValue(row, ['lance medio 3 ultimas ass', 'lance medio 3'], consortium.lanceMedio3)),
    lanceMin: numberValue(findValue(row, ['lance minimo', 'lance mínimo'], consortium.lanceMin)),
    lanceMax: numberValue(findValue(row, ['lance maximo', 'lance máximo'], consortium.lanceMax)),
  };
}

function calculateConsortium(consortium) {
  const carta = Number(consortium.faixaCredito || 0);
  const maxLance = carta * 0.5;
  const ownBid = consortium.lanceProprioModo === 'pct' ? (Number(consortium.lanceProprio || 0) / 100) * carta : Number(consortium.lanceProprio || 0);
  const embeddedBid = consortium.lanceEmbutidoModo === 'pct' ? (Number(consortium.lanceEmbutido || 0) / 100) * carta : Number(consortium.lanceEmbutido || 0);
  let lanceProprioVal = Math.min(maxLance, Math.max(0, ownBid));
  let lanceEmbutidoVal = Math.min(maxLance, Math.max(0, embeddedBid));
  if (lanceProprioVal + lanceEmbutidoVal > carta) {
    lanceEmbutidoVal = Math.max(0, lanceEmbutidoVal - ((lanceProprioVal + lanceEmbutidoVal) - carta));
  }
  const lanceTotalVal = lanceProprioVal + lanceEmbutidoVal;
  const cartaPos = Math.max(0, carta - lanceTotalVal);
  const parcelaAutoDefault = roundMoney(carta / Math.max(1, Number(consortium.prazoTotal || 1)));
  const parcelaAfterLance = roundMoney(cartaPos / Math.max(1, Number(consortium.prazoRemanescente || consortium.prazoTotal || 1)));
  const parcelaMensal = consortium.userParcelaOverride && Number(consortium.parcelaAntes || 0) > 0
    ? Number(consortium.parcelaAntes)
    : parcelaAfterLance;
  return {
    carta,
    lanceProprioVal,
    lanceEmbutidoVal,
    lanceTotalVal,
    lanceTotalPct: carta > 0 ? (lanceTotalVal / carta) * 100 : 0,
    cartaPos,
    parcelaAutoDefault,
    parcelaMensal,
  };
}

function renderFinancing(state) {
  const financing = state.financing;
  let result;
  let error = '';
  try {
    result = calculatePhases(financing);
  } catch (err) {
    error = err.message || 'Erro ao calcular financiamento.';
    result = { loanAmount: 0, phases: [] };
  }
  const activePhase = Math.min(state.activePhase || 0, Math.max(0, result.phases.length - 1));
  const phase = result.phases[activePhase];
  const first = phase?.rows?.[0];
  const last = phase?.rows?.at(-1);

  return `
    <section class="settings-section">
      <h2 class="settings-section__title">Financiamento</h2>
      ${error ? `<div class="settings-banner settings-banner--error">${esc(error)}</div>` : ''}
      <div class="settings-card">
        <h3 class="settings-card__title">Configuracoes gerais</h3>
        <div class="pyamortiza-grid">
          ${field('ID da simulacao', 'simId', financing.simId, 'number', 'step="1" min="1"')}
          ${field('Valor do imovel', 'propertyValue', financing.propertyValue, 'number', 'step="1000" min="0"')}
          ${field('Entrada', 'downPayment', financing.downPayment, 'number', 'step="1000" min="0"')}
          ${field('Valor do financiamento', 'loanAmount', result.loanAmount, 'number', 'disabled')}
          ${field('Prazo em meses', 'termMonths', financing.termMonths, 'number', 'step="1" min="1"')}
          ${field('1o vencimento', 'startDate', financing.startDate, 'date')}
          ${selectField('Sistema', 'system', financing.system, [['SAC', 'SAC'], ['PRICE', 'PRICE']])}
          ${field('Casas decimais', 'rounding', financing.rounding, 'number', 'step="1" min="0" max="6"')}
        </div>
      </div>

      <div class="settings-card">
        <h3 class="settings-card__title">Configuracoes do banco</h3>
        <div class="pyamortiza-grid">
          ${field('Banco', 'bankName', financing.bankName, 'text', 'maxlength="40"')}
          ${field('Taxa efetiva a.a.', 'effectiveAnnualRate', financing.effectiveAnnualRate, 'number', 'step="0.0001" min="0"')}
          ${field('MIP taxa a.m.', 'mipMonthlyRate', financing.mipMonthlyRate, 'number', 'step="0.000001" min="0"')}
          ${field('DFI fixo mensal', 'dfiFixedMonthly', financing.dfiFixedMonthly, 'number', 'step="0.01" min="0"')}
          ${field('DFI taxa a.m.', 'dfiMonthlyRate', financing.dfiMonthlyRate, 'number', 'step="0.000001" min="0"')}
          ${field('Seguro extra mensal', 'otherInsuranceMonthly', financing.otherInsuranceMonthly, 'number', 'step="0.01" min="0"')}
          ${field('Taxa de administracao', 'adminFeeMonthly', financing.adminFeeMonthly, 'number', 'step="0.01" min="0"')}
        </div>
        <div class="form-group" style="margin-top:var(--space-3)">
          <label class="form-label" for="mipOverrides">MIP overrides por mes</label>
          <textarea class="form-input pyamortiza-textarea" id="mipOverrides" name="mipOverrides" placeholder="2026-01: 68,86">${esc(financing.mipOverrides)}</textarea>
        </div>
      </div>

      <div class="settings-card">
        <h3 class="settings-card__title">Fases de amortizacao</h3>
        <div id="amortizations-list">
          ${financing.amortizations.map((item, index) => `
            <div class="pyamortiza-amort-row" data-amort-index="${index}">
              ${field(`Mes/ano #${index + 1}`, `amortDate${index}`, `${esc(item.date || monthKey(financing.startDate))}-01`, 'date')}
              ${field(`Valor #${index + 1}`, `amortAmount${index}`, item.amount || 0, 'number', 'step="1000" min="0"')}
              ${selectField(`Estrategia #${index + 1}`, `amortKeepTerm${index}`, item.keepTerm === false ? 'payment' : 'term', [['term', 'Manter prazo'], ['payment', 'Manter parcela']])}
              <button type="button" class="btn btn--danger-outline" data-remove-amort="${index}">Remover</button>
            </div>
          `).join('')}
        </div>
        <div class="pyamortiza-actions">
          <button type="button" class="btn btn--secondary" id="add-amortization">Adicionar amortizacao</button>
        </div>
      </div>

      <div class="settings-card">
        <h3 class="settings-card__title">Resultado</h3>
        <div class="pyamortiza-summary">
          ${metric('Valor financiado', money(result.loanAmount))}
          ${metric('Fases', String(result.phases.length))}
          ${metric('Primeiro encargo', first ? money(first.totalCharge) : money(0))}
          ${metric('Ultimo encargo', last ? money(last.totalCharge) : money(0))}
        </div>
        <div class="pyamortiza-phase-tabs">
          ${result.phases.map((item, index) => `
            <button type="button" class="btn btn--secondary btn--sm" data-phase="${index}" aria-pressed="${index === activePhase ? 'true' : 'false'}">${esc(item.label)}</button>
          `).join('')}
        </div>
        ${scheduleTable(phase?.rows || [])}
      </div>
    </section>
  `;
}

function renderConsortium(state) {
  const consortium = state.consortium;
  const rows = parseDelimited(consortium.csvData);
  const groupOptions = rows.map((row) => findValue(row, ['grupo', 'gr', 'id grupo', 'nr_grupo', 'numero do grupo'], Object.values(row)[0])).filter(Boolean);
  const calc = calculateConsortium(consortium);
  return `
    <section class="settings-section">
      <h2 class="settings-section__title">Consorcio</h2>
      <div class="pyamortiza-note">Importacao Excel foi adaptada para CSV/TSV colado ou exportado da planilha original, sem bibliotecas externas.</div>

      <div class="settings-card">
        <h3 class="settings-card__title">Importacao de planilha</h3>
        <div class="form-group">
          <label class="form-label" for="csvData">CSV/TSV de grupos</label>
          <textarea class="form-input pyamortiza-textarea" id="csvData" name="csvData" placeholder="grupo;faixa de credito;prazo total">${esc(consortium.csvData)}</textarea>
        </div>
        <div class="pyamortiza-grid--2 pyamortiza-grid" style="margin-top:var(--space-3)">
          ${selectField('Grupo importado', 'selectedGroup', consortium.selectedGroup, [['', 'Selecione'], ...groupOptions.map((g) => [g, g])])}
          <div class="form-group">
            <label class="form-label">&nbsp;</label>
            <button type="button" class="btn btn--secondary" id="apply-csv-group">Auto-preencher grupo</button>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <h3 class="settings-card__title">Dados do consorcio</h3>
        <div class="pyamortiza-grid pyamortiza-grid--3">
          ${field('Grupo', 'grupo', consortium.grupo, 'text', 'maxlength="60"')}
          ${selectField('Embutido', 'embutido', consortium.embutido, [['Nao', 'Nao'], ['Sim', 'Sim']])}
          ${field('Faixa de credito', 'faixaCredito', consortium.faixaCredito, 'number', 'step="1000" min="0"')}
          ${field('Participantes', 'participantes', consortium.participantes, 'text', 'maxlength="80"')}
          ${field('Prazo total', 'prazoTotal', consortium.prazoTotal, 'number', 'step="1" min="1"')}
          ${field('Prazo remanescente', 'prazoRemanescente', consortium.prazoRemanescente, 'number', 'step="1" min="1"')}
        </div>
      </div>

      <div class="settings-card">
        <h3 class="settings-card__title">Indicadores</h3>
        <div class="pyamortiza-grid pyamortiza-grid--3">
          ${field('Lance fixo', 'lanceFixo', consortium.lanceFixo, 'number', 'step="100" min="0"')}
          ${field('Lance livre', 'lanceLivre', consortium.lanceLivre, 'number', 'step="100" min="0"')}
          ${field('Total contemplados', 'totalContemplados', consortium.totalContemplados, 'text', 'maxlength="80"')}
          ${field('Contemplado sorteio', 'contempladoSorteio', consortium.contempladoSorteio, 'text', 'maxlength="80"')}
          ${field('Cotas excluidas', 'cotasExcluidas', consortium.cotasExcluidas, 'text', 'maxlength="80"')}
          ${field('Contemplado lance livre', 'contempladoLivre', consortium.contempladoLivre, 'text', 'maxlength="80"')}
          ${field('Contemplado lance fixo', 'contempladoFixo', consortium.contempladoFixo, 'text', 'maxlength="80"')}
          ${field('Contemplados ultima ass.', 'contempladosUltima', consortium.contempladosUltima, 'text', 'maxlength="80"')}
          ${field('Lance medio 3 ultimas ass. (%)', 'lanceMedio3', consortium.lanceMedio3, 'number', 'step="0.1" min="0"')}
          ${field('Lance minimo', 'lanceMin', consortium.lanceMin, 'number', 'step="100" min="0"')}
          ${field('Lance maximo', 'lanceMax', consortium.lanceMax, 'number', 'step="100" min="0"')}
        </div>
      </div>

      <div class="settings-card">
        <h3 class="settings-card__title">Parcela e lances</h3>
        <div class="pyamortiza-grid">
          ${field('Parcela antes do lance', 'parcelaAntes', consortium.parcelaAntes || calc.parcelaAutoDefault, 'number', 'step="50" min="0"')}
          ${selectField('Modo lance proprio', 'lanceProprioModo', consortium.lanceProprioModo, [['pct', '%'], ['brl', 'R$']])}
          ${field('Lance proprio', 'lanceProprio', consortium.lanceProprio, 'number', 'step="100" min="0"')}
          ${selectField('Modo lance embutido', 'lanceEmbutidoModo', consortium.lanceEmbutidoModo, [['pct', '%'], ['brl', 'R$']])}
          ${field('Lance embutido', 'lanceEmbutido', consortium.lanceEmbutido, 'number', 'step="100" min="0"')}
        </div>
        <label class="toggle-row" style="margin-top:var(--space-3)">
          <input type="checkbox" id="userParcelaOverride" name="userParcelaOverride" ${consortium.userParcelaOverride ? 'checked' : ''}>
          <span>Usar parcela antes do lance como parcela mensal</span>
        </label>
      </div>

      <div class="settings-card">
        <h3 class="settings-card__title">Resumo</h3>
        <div class="pyamortiza-summary">
          ${metric('Lance total', money(calc.lanceTotalVal))}
          ${metric('Lance total (%)', `${roundMoney(calc.lanceTotalPct, 2)} %`)}
          ${metric('Parcela mensal', money(calc.parcelaMensal))}
          ${metric('Carta pos-lance', money(calc.cartaPos))}
        </div>
        <div class="pyamortiza-table-wrap">
          <table class="pyamortiza-table">
            <tbody>
              ${[
                ['Faixa de credito', money(calc.carta)],
                ['Parcela antes do lance', money(consortium.parcelaAntes || calc.parcelaAutoDefault)],
                ['Lance proprio', money(calc.lanceProprioVal)],
                ['Lance embutido', money(calc.lanceEmbutidoVal)],
                ['Lance total (%)', `${roundMoney(calc.lanceTotalPct, 2)} %`],
                ['Parcela mensal', money(calc.parcelaMensal)],
                ['Carta pos-lance', money(calc.cartaPos)],
              ].map(([label, value]) => `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function readForm(state, root) {
  const form = root.querySelector('#pyamortiza-form');
  if (!form) return;
  const target = state.activeTab === 'financing' ? state.financing : state.consortium;
  form.querySelectorAll('input[name], select[name], textarea[name]').forEach((input) => {
    if (input.disabled || input.name === 'loanAmount') return;
    if (input.type === 'checkbox') target[input.name] = input.checked;
    else if (input.type === 'number') target[input.name] = Number(input.value || 0);
    else target[input.name] = input.value;
  });
  if (state.activeTab === 'financing') {
    target.amortizations = target.amortizations.map((item, index) => ({
      date: monthKey(root.querySelector(`#amortDate${index}`)?.value || item.date),
      amount: Number(root.querySelector(`#amortAmount${index}`)?.value || item.amount || 0),
      keepTerm: root.querySelector(`#amortKeepTerm${index}`)?.value !== 'payment',
    }));
  }
}

function renderView(container, state) {
  container.replaceChildren();
  container.insertAdjacentHTML('beforeend', `
    <div class="page pyamortiza-page">
      <div class="page__header">
        <h1 class="page__title">pyAmortiza</h1>
      </div>
      <div class="pyamortiza-tabs" role="group" aria-label="Modulos pyAmortiza">
        <button type="button" class="btn btn--secondary pyamortiza-tab" data-tab="financing" aria-pressed="${state.activeTab === 'financing'}">Financiamento</button>
        <button type="button" class="btn btn--secondary pyamortiza-tab" data-tab="consortium" aria-pressed="${state.activeTab === 'consortium'}">Consorcio</button>
      </div>
      <form id="pyamortiza-form" autocomplete="off">
        ${state.activeTab === 'financing' ? renderFinancing(state) : renderConsortium(state)}
      </form>
    </div>
  `);
  if (window.lucide) window.lucide.createIcons({ el: container });
}

export async function render(container) {
  const state = loadState();
  renderView(container, state);

  container.addEventListener('change', (event) => {
    if (!event.target.closest('#pyamortiza-form')) return;
    readForm(state, container);
    saveState(state);
    renderView(container, state);
  });

  container.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) {
      readForm(state, container);
      state.activeTab = tab.dataset.tab;
      state.activePhase = 0;
      saveState(state);
      renderView(container, state);
      return;
    }

    const phase = event.target.closest('[data-phase]');
    if (phase) {
      readForm(state, container);
      state.activePhase = Number(phase.dataset.phase || 0);
      saveState(state);
      renderView(container, state);
      return;
    }

    if (event.target.closest('#add-amortization')) {
      readForm(state, container);
      state.financing.amortizations.push({ date: monthKey(state.financing.startDate), amount: 0, keepTerm: true });
      saveState(state);
      renderView(container, state);
      return;
    }

    const remove = event.target.closest('[data-remove-amort]');
    if (remove) {
      readForm(state, container);
      state.financing.amortizations.splice(Number(remove.dataset.removeAmort), 1);
      saveState(state);
      renderView(container, state);
      return;
    }

    if (event.target.closest('#apply-csv-group')) {
      readForm(state, container);
      state.consortium = applyConsortiumCsv(state.consortium);
      saveState(state);
      renderView(container, state);
    }
  });
}
