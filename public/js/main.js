const signupForm = document.getElementById('signupForm');
const loginForm = document.getElementById('loginForm');

if (signupForm) {
  signupForm.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(signupForm).entries());

    const res = await fetch('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    document.getElementById('signupMessage').textContent = result.message;
  };
}

if (loginForm) {
  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm).entries());

    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    if (result.success) {
      localStorage.setItem('username', data.username);
      window.location.href = '/home.html';
    } else {
      document.getElementById('loginMessage').textContent = result.message;
    }
  };
}
