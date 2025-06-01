const backendUrl = process.env.BACKEND_URL || 'https://your-backend-url'; // Replace with your backend URL
const socket = io(backendUrl, { withCredentials: true });

async function loadUserData() {
  const response = await fetch(`${backendUrl}/api/user`, { credentials: 'include' });
  if (response.status === 401) window.location.href = '/login.html';
  const user = await response.json();
  document.getElementById('user-id').textContent = `Your ID: ${user.userId}`;
  return user;
}

async function loadContacts() {
  const response = await fetch(`${backendUrl}/api/contacts`, { credentials: 'include' });
  const contacts = await response.json();
  const contactList = document.getElementById('contact-list');
  contactList.innerHTML = '';
  contacts.forEach(contact => {
    const li = document.createElement('li');
    li.innerHTML = `
      <a href="/chat.html?contactId=${contact.contactId}">${contact.username}</a>
      <form class="delete-contact-form" onsubmit="deleteContact(event, '${contact.contactId}')">
        <button type="submit" class="delete-contact-btn">🗑️</button>
      </form>
    `;
    contactList.appendChild(li);
  });
}

async function deleteContact(event, contactId) {
  event.preventDefault();
  await fetch(`${backendUrl}/api/contacts/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId }),
    credentials: 'include'
  });
  loadContacts();
}

document.getElementById('add-contact-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const contactId = e.target.contactId.value;
  await fetch(`${backendUrl}/api/contacts/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId }),
    credentials: 'include'
  });
  e.target.contactId.value = '';
  loadContacts();
});

document.getElementById('delete-account-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  await fetch(`${backendUrl}/api/delete-account`, {
    method: 'POST',
    credentials: 'include'
  });
  window.location.href = '/login.html';
});

if (window.location.pathname.includes('chat.html')) {
  const urlParams = new URLSearchParams(window.location.search);
  const contactId = urlParams.get('contactId');
  const user = loadUserData();
  if (contactId && user.userId) {
    const room = [user.userId, contactId].sort().join('-');
    socket.emit('join', room);

    socket.on('message', ({ senderId, message }) => {
      const msgDiv = document.createElement('div');
      msgDiv.className = `message ${senderId === user.userId ? 'sent' : 'received'}`;
      msgDiv.textContent = message;
      document.getElementById('messages').appendChild(msgDiv);
      document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
    });

    document.getElementById('sendButton')?.addEventListener('click', () => {
      const input = document.getElementById('messageInput');
      const message = input.value.trim();
      if (message) {
        socket.emit('chatMessage', { room, message, senderId: user.userId });
        input.value = '';
      }
    });

    document.getElementById('messageInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();
        if (message) {
          socket.emit('chatMessage', { room, message, senderId: user.userId });
          input.value = '';
        }
      }
    });
  }
}

window.onload = () => {
  loadUserData();
  loadContacts();
};