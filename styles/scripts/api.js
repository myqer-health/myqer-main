// styles/scripts/api.js
window.MYQER_API_BASE = "https://myqer-main.onrender.com";

window.apiPost = async function apiPost(path, data) {
  const res = await fetch(`${window.MYQER_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || json.message || `HTTP ${res.status}`);
  return json;
};
