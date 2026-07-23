// Client-side filter + sort for the screener table (no dependencies).
function filterRows() {
  const q = (document.getElementById('filter').value || '').toLowerCase();
  const onlyPass = document.getElementById('onlyPass').checked;
  const onlyOwned = document.getElementById('onlyOwned').checked;
  document.querySelectorAll('#screen tbody tr').forEach(tr => {
    const hay = (tr.dataset.ticker + ' ' + tr.dataset.name + ' ' + tr.dataset.sector).toLowerCase();
    let show = hay.includes(q);
    if (onlyPass && Number(tr.dataset.passes) < 1) show = false;
    if (onlyOwned && Number(tr.dataset.gurus) < 1) show = false;
    tr.style.display = show ? '' : 'none';
  });
}

let sortState = {};
function sortBy(key, numeric) {
  const tbody = document.querySelector('#screen tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const dir = sortState[key] === 'asc' ? 'desc' : 'asc';
  sortState = { [key]: dir };
  rows.sort((a, b) => {
    let av = a.dataset[key], bv = b.dataset[key];
    if (numeric) { av = parseFloat(av) || 0; bv = parseFloat(bv) || 0; }
    else { av = (av || '').toLowerCase(); bv = (bv || '').toLowerCase(); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
  rows.forEach(r => tbody.appendChild(r));
}
