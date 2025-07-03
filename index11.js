<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <title>Kuljetuslista</title>
  <style>
    body { font-family: sans-serif; background: #f0f0f0; padding: 30px; }
    h1, h2 { text-align: center; }
    .item { background: white; margin: 10px auto; padding: 15px; max-width: 600px; border-radius: 8px; box-shadow: 0 0 5px #ccc; }
    .item strong { display: inline-block; width: 110px; }
    .btn {
      margin-top: 10px;
      margin-right: 10px;
      background: #3498db;
      color: white;
      border: none;
      padding: 8px 14px;
      border-radius: 5px;
      cursor: pointer;
    }
    .btn.delete { background: #e74c3c; }
    .btn.pay { background: #27ae60; }
    .btn.release { background: #f39c12; }
    #user-info { text-align: center; margin-bottom: 20px; }
    a { display: block; text-align: center; margin-top: 30px; text-decoration: none; color: #4CAF50; }
    .edit-form input, .edit-form textarea { width: 100%; margin: 4px 0; }
  </style>
</head>
<body>

  <h1>Kuljetuslista</h1>
  <div id="user-info">Ladataan käyttäjätietoja...</div>

  <h2>📦 Kuljetuspyynnöt</h2>
  <div id="requests"></div>

  <h2>🚗 Kuljetustarjoukset</h2>
  <div id="offers"></div>

  <a href="https://automaton.fi/tavarakyyti.html">⬅️ Takaisin etusivulle</a>

  <script>
    let currentUserId = null;

    async function loadUser() {
      const res = await fetch('https://tavarakyyti.onrender.com/me', { credentials: 'include' });
      if (res.ok) {
        const user = await res.json();
        currentUserId = user._id;
        document.getElementById('user-info').textContent = `Kirjautunut: ${user.name}`;
      } else {
        document.getElementById('user-info').textContent = 'Et ole kirjautunut.';
      }
    }

    async function loadData() {
      const [requests, offers] = await Promise.all([
        fetch('https://tavarakyyti.onrender.com/api/requests').then(r => r.json()),
        fetch('https://tavarakyyti.onrender.com/api/offers').then(r => r.json())
      ]);

      renderList(requests, 'requests', 'request');
      renderList(offers, 'offers', 'offer');
    }

    function renderList(items, containerId, type) {
      const container = document.getElementById(containerId);
      container.innerHTML = '';
      for (const item of items) {
        const div = document.createElement('div');
        div.className = 'item';

        const keys = Object.entries(item)
          .filter(([k]) => !['_id', '__v', 'createdAt', 'user'].includes(k))
          .map(([k, v]) => `<div><strong>${suomiKentta(k)}:</strong> ${v}</div>`)
          .join('');

        div.innerHTML = keys;

        if (item.user === currentUserId) {
          div.innerHTML += `
            <button class="btn delete" onclick="deleteItem('${type}', '${item._id}')">Poista</button>
            <button class="btn" onclick="editItem('${type}', '${item._id}', ${JSON.stringify(item).replace(/"/g, '&quot;')})">Muokkaa</button>
          `;
        } else {
          div.innerHTML += `
            <button class="btn pay" onclick="authorizePayment('${item._id}')">Varaa 500 € kate</button>
            <button class="btn release" onclick="releasePayment('${item._id}')">Vapauta maksu</button>
          `;
        }

        container.appendChild(div);
      }
    }

    function suomiKentta(key) {
      const map = {
        from: 'Mistä',
        to: 'Minne',
        date: 'Päivämäärä',
        size: 'Koko',
        price: 'Hinta (€)',
        route: 'Reitti',
        vehicle: 'Ajoneuvo',
        priceRange: 'Hintahaarukka (€)',
        details: 'Lisätiedot',
        recurring: 'Jatkuva matka'
      };
      return map[key] || key;
    }

    async function deleteItem(type, id) {
      if (!confirm('Haluatko varmasti poistaa tämän?')) return;
      const res = await fetch(`https://tavarakyyti.onrender.com/api/${type}s/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        alert('Poistettu!');
        loadData();
      } else {
        alert('Virhe poistettaessa.');
      }
    }

    function editItem(type, id, itemData) {
      const form = document.createElement('form');
      form.className = 'edit-form';
      form.onsubmit = async (e) => {
        e.preventDefault();
        const formData = Object.fromEntries(new FormData(form));
        const res = await fetch(`https://tavarakyyti.onrender.com/api/${type}s/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(formData)
        });
        if (res.ok) {
          alert('Päivitetty!');
          loadData();
        } else {
          alert('Virhe päivityksessä.');
        }
      };

      Object.entries(itemData).forEach(([key, val]) => {
        if (['_id', '__v', 'createdAt', 'user'].includes(key)) return;
        const label = document.createElement('label');
        label.textContent = suomiKentta(key);
        const input = key === 'details' ? document.createElement('textarea') : document.createElement('input');
        input.name = key;
        input.value = val;
        form.appendChild(label);
        form.appendChild(input);
      });

      const submit = document.createElement('button');
      submit.className = 'btn';
      submit.textContent = 'Tallenna';
      form.appendChild(submit);

      const wrapper = document.createElement('div');
      wrapper.className = 'item';
      wrapper.appendChild(form);

      document.getElementById(type === 'request' ? 'requests' : 'offers').prepend(wrapper);
    }

    async function authorizePayment(id) {
      const res = await fetch(`https://tavarakyyti.onrender.com/api/payments/authorize/${id}`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        alert('Katevaraus tehty! Maksu odottaa vapautusta.');
      } else {
        alert('Virhe varauksessa.');
      }
    }

    async function releasePayment(id) {
      const res = await fetch(`https://tavarakyyti.onrender.com/api/payments/release/${id}`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        alert('Maksu vapautettu!');
      } else {
        alert('Virhe vapautuksessa.');
      }
    }

    loadUser().then(loadData);
  </script>

</body>
</html>
