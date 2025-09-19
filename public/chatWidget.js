// Käyttö: include <script src="/chatWidget.js"></script> ja kutsu initChatWidget({ token, conversationId })
</div>
`;
document.body.appendChild(root);


const msgsEl = root.querySelector('#tw-msgs');
const typingEl = root.querySelector('#tw-typing');
const input = root.querySelector('#tw-input');
const sendBtn = root.querySelector('#tw-send');


// socket.io client olettaa että se palvellaan samasta hostista: /socket.io
const socket = io('/', { auth: { token } });


socket.on('connect', () => {
socket.emit('chat:join', { conversationId });
});


let typingTimer;
input.addEventListener('input', () => {
socket.emit('chat:typing', { conversationId, isTyping: true });
clearTimeout(typingTimer);
typingTimer = setTimeout(() => socket.emit('chat:typing', { conversationId, isTyping: false }), 1200);
});


sendBtn.onclick = () => {
const text = input.value.trim();
if(!text) return;
const tempId = 'tmp-'+Date.now();
append({ text, senderId: 'me', createdAt: new Date().toISOString() });
socket.emit('chat:message', { conversationId, text, tempId });
input.value = '';
};


socket.on('chat:message:new', ({ tempId, message }) => {
append(message);
msgsEl.scrollTop = msgsEl.scrollHeight;
});


socket.on('chat:typing', ({ userId, isTyping }) => {
typingEl.style.display = isTyping ? 'inline' : 'none';
});


function append(m){
const d = document.createElement('div');
const time = new Date(m.createdAt).toLocaleTimeString();
const mine = (m.senderId === 'me');
d.style.margin = '4px 0';
d.innerHTML = `<div style="display:flex;${mine? 'justify-content:flex-end':''}">
<div style="max-width:80%;padding:6px 8px;border-radius:8px;background:${mine?'#2a2a2a':'#191919'};border:1px solid #333">
<div style="font-size:12px;opacity:.7">${time}</div>
<div>${escapeHtml(m.text||'')}</div>
${(m.attachments||[]).map(a=>`<div><a href="${a.url}" target="_blank" rel="noreferrer">${a.name||a.url}</a></div>`).join('')}
</div>
</div>`;
msgsEl.appendChild(d);
}


function escapeHtml(s){
return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}


return { destroy(){ root.remove(); socket.disconnect(); } };
}
})();
