const fs = require('fs');

let html = fs.readFileSync('dropscout.html', 'utf8');

const injection = `</script>
<style>
/* LED Glow for Trend Radar */
.trend-radar-btn {
  position: relative;
  transition: all 0.3s ease;
}
.trend-radar-btn::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(168, 85, 247, 0.15);
  box-shadow: 0 0 15px 2px rgba(168, 85, 247, 0.4);
  border-radius: 8px;
  z-index: -1;
  opacity: 0.8;
  animation: pulse-glow 2s infinite alternate;
}
@keyframes pulse-glow {
  0% { opacity: 0.5; box-shadow: 0 0 10px 1px rgba(168, 85, 247, 0.3); }
  100% { opacity: 1; box-shadow: 0 0 20px 4px rgba(168, 85, 247, 0.6); }
}
</style>
<script>
// Link Analizi Slot Machine Effect
document.addEventListener('DOMContentLoaded', () => {
  const analyzeBtn = document.querySelector('.analyze-btn');
  const linkInput = document.querySelector('.link-input');
  
  const section = document.getElementById('section-link-analizi');
  if(!section) return;

  const scoreEl = section.querySelector('.nr-amount.g'); 
  const marginPctEls = section.querySelectorAll('.nr-pct.g'); 
  const marginPctEl = marginPctEls.length > 1 ? marginPctEls[1] : marginPctEls[0];
  const compEl = section.querySelector('.nr-amount.y'); 
  
  const originalValues = {
    score: scoreEl ? scoreEl.innerText : '94',
    margin: marginPctEl ? marginPctEl.innerText : '%28',
    comp: compEl ? compEl.innerText : '8K'
  };

  let slotInterval = null;

  function startSlotMachine() {
    section.style.opacity = '0.9';
    section.style.filter = 'grayscale(20%)';

    slotInterval = setInterval(() => {
      if (scoreEl) scoreEl.innerText = Math.floor(Math.random() * (99 - 70 + 1) + 70);
      if (marginPctEl) marginPctEl.innerText = '%' + Math.floor(Math.random() * (45 - 15 + 1) + 15);
      if (compEl) compEl.innerText = Math.floor(Math.random() * 15) + 'K';
    }, 100);
  }

  function stopSlotMachine() {
    clearInterval(slotInterval);
    section.style.opacity = '1';
    section.style.filter = 'none';

    if (scoreEl) scoreEl.innerText = originalValues.score;
    if (marginPctEl) marginPctEl.innerText = originalValues.margin;
    if (compEl) compEl.innerText = originalValues.comp;

    const resultGrid = section.querySelector('.result-grid');
    if(resultGrid) {
      resultGrid.classList.remove('panel-flash');
      void resultGrid.offsetWidth;
      resultGrid.classList.add('panel-flash');
    }
  }

  if (analyzeBtn && linkInput) {
    startSlotMachine();
    
    analyzeBtn.addEventListener('click', () => {
      if (!linkInput.value.trim()) return;
      
      analyzeBtn.classList.add('loading');
      analyzeBtn.innerText = 'Analiz Ediliyor...';
      const loadingBar = section.querySelector('.loading-bar');
      if(loadingBar) loadingBar.classList.add('active');
      
      setTimeout(() => {
        analyzeBtn.classList.remove('loading');
        analyzeBtn.innerText = 'Analiz Et';
        if(loadingBar) loadingBar.classList.remove('active');
        stopSlotMachine();
      }, 1800);
    });
  }
});

// Update Sidebar Link
document.querySelectorAll('.nav-item').forEach(item => {
  if(item.innerText.includes('Trend Radar')) {
    item.classList.add('trend-radar-btn');
  }
  if(item.innerText.includes('Link Analizi')) {
    item.href = '#section-link-analizi';
    item.addEventListener('click', (e) => {
      if (window.location.pathname.includes('dropscout.html')) {
        e.preventDefault();
        const section = document.getElementById('section-link-analizi');
        if (section) section.scrollIntoView({behavior: 'smooth'});
      }
    });
  }
});
</script>
</body>
</html>`;

// Remove the end tags first, then append our custom code
html = html.substring(0, html.lastIndexOf('</script>'));
html += injection;

fs.writeFileSync('dropscout.html', html, 'utf8');
console.log('Successfully injected Link Analysis and LED Glow code');
