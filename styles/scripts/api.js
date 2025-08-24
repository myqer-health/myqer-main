// styles/scripts/api.js
window.MYQER_API_BASE = "https://myqer-main.onrender.com";

async function apiPost(path, data) {
  const url = `${window.MYQER_API_BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (e) {
    throw new Error("Network error. Is the API awake?");
  }

  let bodyText = await res.text();
  let json;
  try { json = bodyText ? JSON.parse(bodyText) : {}; } catch { json = {}; }

  if (!res.ok) {
    const msg = json.detail || json.message || bodyText || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

window.apiPost = apiPost;
