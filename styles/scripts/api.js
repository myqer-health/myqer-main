<!-- /styles/scripts/api.js -->
<script>
  // Where your Python API lives
  window.MYQER_API_BASE = "https://myqer-python.onrender.com";

  // Small helper for JSON POSTs
  window.apiPost = async function apiPost(path, data) {
    const res = await fetch(`${window.MYQER_API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "omit",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.detail || json.message || `HTTP ${res.status}`);
    return json;
  };
</script>
