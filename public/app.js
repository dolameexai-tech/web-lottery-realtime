// Frontend Application Controller - Lotto Hub

document.addEventListener('DOMContentLoaded', () => {
  // Constants
  const API_BASE = window.location.origin;
  
  // Elements
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabSections = document.querySelectorAll('.tab-section');
  const liveIndicator = document.getElementById('live-indicator');
  const btnCopyCode = document.getElementById('btn-copy-code');
  const codeSnippet = document.getElementById('code-snippet');
  const toastContainer = document.getElementById('toast-container');
  
  // Lao Numbers Elements
  const laoDrawNum = document.getElementById('lao-draw-num');
  const laoDrawDate = document.getElementById('lao-draw-date');
  const laoNumbersContainer = document.getElementById('lao-numbers-container');
  const lao5Digits = document.getElementById('lao-5-digits');
  const lao4Digits = document.getElementById('lao-4-digits');
  const lao3Digits = document.getElementById('lao-3-digits');
  const lao2Digits = document.getElementById('lao-2-digits');
  
  // Thai Numbers Elements
  const thaiDrawDate = document.getElementById('thai-draw-date');
  const thaiFirstPrize = document.getElementById('thai-first-prize');
  const thaiLastTwo = document.getElementById('thai-last-two');
  const thaiFrontThree = document.getElementById('thai-front-three');
  const thaiLastThree = document.getElementById('thai-last-three');
  
  // Tables
  const laoHistoryTbody = document.getElementById('lao-history-tbody');
  const thaiHistoryTbody = document.getElementById('thai-history-tbody');
  const historyLaoWrapper = document.getElementById('history-lao-wrapper');
  const historyThaiWrapper = document.getElementById('history-thai-wrapper');
  const historyFilters = document.querySelectorAll('.history-filter-btn');

  // Forms
  const laoAdminForm = document.getElementById('lao-admin-form');
  const thaiAdminForm = document.getElementById('thai-admin-form');
  const adminKeyInput = document.getElementById('admin-key-input');
  
  // Lao Admin Inputs (for auto-tabbing)
  const laoNumInputs = document.querySelectorAll('.lao-num-in');

  // Active SSE connection
  let eventSource = null;

  // --- INITIALIZATION ---
  // Get local date string in YYYY-MM-DD format
  function getLocalDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // --- INITIALIZATION ---
  initApp();

  function initApp() {
    setupTabs();
    setupLaoAutoTabbing();
    setupCopyCode();
    setupForms();
    setupHistoryFilters();
    
    // Set default date to today (local time)
    const today = getLocalDateString();
    const laoDateInput = document.getElementById('lao-date');
    const thaiDateInput = document.getElementById('thai-date');
    if (laoDateInput) laoDateInput.value = today;
    if (thaiDateInput) thaiDateInput.value = today;
    
    // Fetch initial data
    fetchLatestResults();
    fetchHistory();
    
    // Connect to real-time SSE stream
    connectRealtimeStream();
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-triangle-exclamation';
    
    toast.innerHTML = `
      <i class="fa-solid ${iconClass} toast-icon"></i>
      <span class="toast-message">${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    // Remove toast after animation ends
    setTimeout(() => {
      toast.style.transform = 'translateX(120%)';
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 4000);
  }

  // --- TABS NAVIGATION ---
  function setupTabs() {
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        
        // Remove active class from buttons and sections
        tabButtons.forEach(b => b.classList.remove('active'));
        tabSections.forEach(s => s.classList.remove('active'));
        
        // Add active to current
        btn.classList.add('active');
        document.getElementById(`tab-${targetTab}`).classList.add('active');
      });
    });
  }

  // --- ADMIN PORTAL LAO AUTO-TABBING ---
  function setupLaoAutoTabbing() {
    laoNumInputs.forEach((input, index) => {
      // Move to next input on digit entry
      input.addEventListener('input', (e) => {
        if (e.target.value.length === 1 && index < laoNumInputs.length - 1) {
          laoNumInputs[index + 1].focus();
        }
      });

      // Backspace handler to return to previous input
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && e.target.value.length === 0 && index > 0) {
          laoNumInputs[index - 1].focus();
        }
      });
    });
  }

  // --- COPY API CODE ---
  function setupCopyCode() {
    btnCopyCode.addEventListener('click', () => {
      const code = codeSnippet.innerText;
      navigator.clipboard.writeText(code)
        .then(() => {
          showToast('ຄັດລອກ Code ຕົວຢ່າງສຳເລັດ!', 'success');
        })
        .catch(err => {
          showToast('ບໍ່ສາມາດຄັດລອກໄດ້', 'error');
          console.error('Failed to copy code: ', err);
        });
    });
  }

  // --- DATA FETCHING & POPULATING ---

  // 1. Fetch Latest Results
  async function fetchLatestResults() {
    try {
      const response = await fetch(`${API_BASE}/api/results/latest`);
      if (!response.ok) throw new Error('Network response not ok');
      const data = await response.json();
      
      if (data.lao) populateLaoResult(data.lao, false);
      if (data.thai) populateThaiResult(data.thai, false);
    } catch (error) {
      console.error('Error fetching latest results:', error);
      showToast('ບໍ່ສາມາດດຶງຂໍ້ມູນຜົນຫວຍຫຼ້າສຸດໄດ້', 'error');
    }
  }

  // Populate Lao Results Card
  function populateLaoResult(laoData, animate = false) {
    laoDrawNum.textContent = `ງວດທີ ${laoData.drawNumber}`;
    
    // Format date nicely (e.g. YYYY-MM-DD to DD/MM/YYYY)
    const formattedDate = formatDate(laoData.date);
    laoDrawDate.textContent = `ວັນທີ ${formattedDate}`;
    
    // Populating 6 digits circles
    laoNumbersContainer.innerHTML = '';
    laoData.numbers.forEach((num, index) => {
      const circle = document.createElement('div');
      circle.className = 'number-circle';
      circle.textContent = num;
      if (animate) {
        circle.classList.add('number-pop');
        // Stagger animation
        circle.style.animationDelay = `${index * 0.1}s`;
      }
      laoNumbersContainer.appendChild(circle);
    });

    // Breakdown digits calculations
    const numsStr = laoData.numbers.join('');
    lao5Digits.textContent = numsStr.substring(1);
    lao4Digits.textContent = numsStr.substring(2);
    lao3Digits.textContent = numsStr.substring(3);
    lao2Digits.textContent = numsStr.substring(4);
    
    // Add pulsing class for live effect on new data
    if (animate) {
      const card = document.querySelector('.lao-theme');
      card.classList.add('new-update');
      setTimeout(() => card.classList.remove('new-update'), 2000);
    }
  }

  // Populate Thai Results Card
  function populateThaiResult(thaiData, animate = false) {
    thaiDrawDate.textContent = `ວັນທີ ${formatDate(thaiData.date)}`;
    
    // First Prize
    thaiFirstPrize.textContent = thaiData.firstPrize;
    if (animate) {
      thaiFirstPrize.classList.add('number-pop');
      setTimeout(() => thaiFirstPrize.classList.remove('number-pop'), 1000);
    }

    // Last 2 digits
    thaiLastTwo.textContent = thaiData.lastTwo;

    // Front 3 digits
    thaiFrontThree.innerHTML = '';
    thaiData.frontThree.forEach(num => {
      const span = document.createElement('span');
      span.textContent = num;
      thaiFrontThree.appendChild(span);
    });

    // Last 3 digits
    thaiLastThree.innerHTML = '';
    thaiData.lastThree.forEach(num => {
      const span = document.createElement('span');
      span.textContent = num;
      thaiLastThree.appendChild(span);
    });
    
    if (animate) {
      const card = document.querySelector('.thai-theme');
      card.classList.add('new-update');
      setTimeout(() => card.classList.remove('new-update'), 2000);
    }
  }

  // 2. Fetch Draw History
  async function fetchHistory() {
    try {
      const [laoRes, thaiRes] = await Promise.all([
        fetch(`${API_BASE}/api/results/lao`),
        fetch(`${API_BASE}/api/results/thai`)
      ]);

      if (!laoRes.ok || !thaiRes.ok) throw new Error('History fetch failed');

      const laoHistory = await laoRes.json();
      const thaiHistory = await thaiRes.json();

      populateLaoHistoryTable(laoHistory);
      populateThaiHistoryTable(thaiHistory);
    } catch (error) {
      console.error('Error fetching history:', error);
      showToast('ບໍ່ສາມາດດຶງຂໍ້ມູນປະຫວັດຫວຍໄດ້', 'error');
    }
  }

  function populateLaoHistoryTable(data) {
    laoHistoryTbody.innerHTML = '';
    if (data.length === 0) {
      laoHistoryTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">ບໍ່ມີຂໍ້ມູນປະຫວັດ</td></tr>';
      return;
    }

    data.forEach(row => {
      const tr = document.createElement('tr');
      const numsStr = row.numbers.join('');
      
      tr.innerHTML = `
        <td class="cell-highlight">ງວດທີ ${row.drawNumber}</td>
        <td>${formatDate(row.date)}</td>
        <td class="history-lao-num">${numsStr}</td>
        <td>${numsStr.substring(1)}</td>
        <td>${numsStr.substring(2)}</td>
        <td>${numsStr.substring(3)}</td>
        <td class="cell-highlight">${numsStr.substring(4)}</td>
      `;
      laoHistoryTbody.appendChild(tr);
    });
  }

  function populateThaiHistoryTable(data) {
    thaiHistoryTbody.innerHTML = '';
    if (data.length === 0) {
      thaiHistoryTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">ບໍ່ມີຂໍ້ມູນປະຫວັດ</td></tr>';
      return;
    }

    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="cell-highlight">${formatDate(row.date)}</td>
        <td class="history-thai-num">${row.firstPrize}</td>
        <td class="cell-highlight">${row.lastTwo}</td>
        <td>${row.frontThree.join(', ')}</td>
        <td>${row.lastThree.join(', ')}</td>
      `;
      thaiHistoryTbody.appendChild(tr);
    });
  }

  // Helper date formatter
  function formatDate(dateStr) {
    if (!dateStr) return '--/--/----';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
  }

  // --- HISTORY TABLE FILTERS ---
  function setupHistoryFilters() {
    historyFilters.forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter');
        
        historyFilters.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (filter === 'all') {
          historyLaoWrapper.style.display = 'block';
          historyThaiWrapper.style.display = 'block';
        } else if (filter === 'lao') {
          historyLaoWrapper.style.display = 'block';
          historyThaiWrapper.style.display = 'none';
        } else if (filter === 'thai') {
          historyLaoWrapper.style.display = 'none';
          historyThaiWrapper.style.display = 'block';
        }
      });
    });
  }

  // --- CONNECT SERVER-SENT EVENTS (SSE) STREAM ---
  function connectRealtimeStream() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource(`${API_BASE}/api/stream`);

    // Stream connection opened
    eventSource.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data);
      console.log('SSE Stream established:', data);
      
      // Update UI Indicator to Online
      liveIndicator.className = 'live-indicator online';
      liveIndicator.querySelector('.indicator-text').textContent = 'Real-time ພ້ອມໃຊ້ງານ';
      showToast('ເຊື່ອມຕໍ່ລະບົບຮັບຜົນ Real-time ສຳເລັດ!', 'success');
    });

    // Real-time Update pushed by Admin
    eventSource.addEventListener('update', (e) => {
      const update = JSON.parse(e.data);
      console.log('Real-time Update received:', update);
      
      const type = update.type; // 'lao' or 'thai'
      const data = update.data;

      if (type === 'lao') {
        populateLaoResult(data, true);
        showToast(`ແຈ້ງເຕືອນ: ຜົນຫວຍລາວງວດທີ ${data.drawNumber} ອອກແລ້ວ! (${data.numbers.join(' ')})`, 'info');
      } else if (type === 'thai') {
        populateThaiResult(data, true);
        showToast(`ແຈ້ງເຕືອນ: ຜົນຫວຍໄທລາງວັນທີ 1 ອອກແລ້ວ! (${data.firstPrize})`, 'info');
      }

      // Re-fetch history silently to include new result
      fetchHistory();
    });

    // Connection errors / offline
    eventSource.onerror = (err) => {
      console.error('SSE connection lost. Reconnecting...', err);
      
      // Update UI Indicator to Offline
      liveIndicator.className = 'live-indicator offline';
      liveIndicator.querySelector('.indicator-text').textContent = 'ເຊື່ອມຕໍ່ຫຼົ້ມເຫຼວ (ກຳລັງຕໍ່ໃໝ່)';
      
      // SSE automatically attempts reconnection, so we just monitor the UI
    };
  }

  // --- ADMIN FORMS HANDLERS ---
  function setupForms() {
    // 1. Submit Lao Lottery Result
    laoAdminForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const drawNumber = document.getElementById('lao-draw').value;
      const date = document.getElementById('lao-date').value;
      const adminKey = adminKeyInput.value;
      
      // Map 6 inputs to digits array
      const numbers = [];
      laoNumInputs.forEach(inField => {
        numbers.push(inField.value);
      });

      const payload = { drawNumber, date, numbers, adminKey };

      try {
        const response = await fetch(`${API_BASE}/api/results/lao`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (response.ok) {
          showToast('ປະກາດຜົນຫວຍລາວສຳເລັດ ແລະ ສົ່ງຂໍ້ມູນ Real-time ແລ້ວ!', 'success');
          // Clear inputs
          document.getElementById('lao-draw').value = '';
          document.getElementById('lao-date').value = getLocalDateString();
          laoNumInputs.forEach(inField => inField.value = '');
          
          // Switch to Latest tab to view result
          document.querySelector('.tab-btn[data-tab="latest"]').click();
        } else {
          showToast(result.error || 'ບັນທຶກຜົນຫວຍຫຼົ້ມເຫຼວ', 'error');
        }
      } catch (error) {
        console.error('Lao Admin submit error:', error);
        showToast('ບໍ່ສາມາດເຊື່ອມຕໍ່ກັບ Server ເພື່ອບັນທຶກຜົນໄດ້', 'error');
      }
    });

    // 2. Submit Thai Lottery Result
    thaiAdminForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const date = document.getElementById('thai-date').value;
      const firstPrize = document.getElementById('thai-first').value;
      const lastTwo = document.getElementById('thai-last2').value;
      const adminKey = adminKeyInput.value;

      const frontThree = [
        document.getElementById('thai-front-1').value,
        document.getElementById('thai-front-2').value
      ];

      const lastThree = [
        document.getElementById('thai-last-1').value,
        document.getElementById('thai-last-2').value
      ];

      const payload = { date, firstPrize, frontThree, lastThree, lastTwo, adminKey };

      try {
        const response = await fetch(`${API_BASE}/api/results/thai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
          showToast('ປະກາດຜົນຫວຍໄທສຳເລັດ ແລະ ສົ່ງຂໍ້ມູນ Real-time ແລ້ວ!', 'success');
          // Clear inputs
          document.getElementById('thai-date').value = getLocalDateString();
          document.getElementById('thai-first').value = '';
          document.getElementById('thai-last2').value = '';
          document.getElementById('thai-front-1').value = '';
          document.getElementById('thai-front-2').value = '';
          document.getElementById('thai-last-1').value = '';
          document.getElementById('thai-last-2').value = '';

          // Switch to Latest tab to view result
          document.querySelector('.tab-btn[data-tab="latest"]').click();
        } else {
          showToast(result.error || 'ບັນທຶກຜົນຫວຍຫຼົ້ມເຫຼວ', 'error');
        }
      } catch (error) {
        console.error('Thai Admin submit error:', error);
        showToast('ບໍ່ສາມາດເຊື່ອມຕໍ່ກັບ Server ເພື່ອບັນທຶກຜົນໄດ້', 'error');
      }
    });
  }

});
