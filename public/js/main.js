// SIGNUP
document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());

  const res = await fetch('/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const result = await res.json();
  document.getElementById('signupMessage').textContent = result.message;

  if (result.success) {
    showToast("Check your email to verify your account.");
  }
});

// LOGIN
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());

  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const result = await res.json();
  document.getElementById('loginMessage').textContent = result.message;

  if (result.success) {
    localStorage.setItem('username', data.username);
    window.location.href = 'home.html';
  }
});

// TOAST
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast show';
  setTimeout(() => toast.className = 'toast', 3000);
}
