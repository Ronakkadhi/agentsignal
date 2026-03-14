// Copy curl command
function copyCommand() {
  navigator.clipboard.writeText('curl agentsignal.co/feed').then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = 'Copied!';
    btn.style.background = '#22c55e';
    btn.style.color = 'white';
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.style.background = '';
      btn.style.color = '';
    }, 2000);
  });
}

// Fetch live demo
async function loadDemo() {
  const output = document.getElementById('demo-output');
  try {
    const res = await fetch('/feed?limit=15');
    const text = await res.text();
    output.textContent = text;
  } catch (err) {
    output.textContent = '# Unable to load live feed\n\nTry: curl ' + window.location.origin + '/feed';
  }
}

// Load demo on page load
document.addEventListener('DOMContentLoaded', loadDemo);

// Refresh demo every 60 seconds
setInterval(loadDemo, 60000);
