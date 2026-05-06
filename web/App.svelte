<script lang="ts">
  import { onMount } from "svelte";
  import { api, type InventorySession, type Item } from "./lib/api";
  import { confidenceLabel, extractEpcs, normalizeEpc } from "./lib/epc";

  type Page = "register" | "inventory" | "items" | "sessions" | "reader";

  let page: Page = "inventory";
  let serverStatus = "Checking";
  let message = "";
  let items: Item[] = [];
  let sessions: any[] = [];
  let activeSession: InventorySession | null = null;
  let keyboardBuffer = "";
  let rawBuffer = "";
  let lastKeyTime = 0;
  let scannedEpc = "";
  let tagStatus = "Waiting for scan";
  let scanInput: HTMLInputElement;

  let newItem = {
    sku: "",
    name: "",
    category: "",
    description: "",
    photoUrl: "",
    notes: ""
  };

  let sessionForm = {
    stationKey: "browser-station-01",
    containerCode: "",
    locationName: "",
    notes: ""
  };

  const navItems: { page: Page; label: string }[] = [
    { page: "inventory", label: "Inventory" },
    { page: "register", label: "Register Tag" },
    { page: "items", label: "Items" },
    { page: "sessions", label: "Sessions" },
    { page: "reader", label: "Reader" }
  ];

  onMount(async () => {
    await refresh();
    window.addEventListener("keydown", handleKeyboardRead);
    focusScanner();
    return () => window.removeEventListener("keydown", handleKeyboardRead);
  });

  async function refresh() {
    try {
      const health = await api.health();
      serverStatus = health.ok ? "Online" : "Offline";
      items = await api.listItems();
      sessions = await api.listSessions();
      if (activeSession) activeSession = await api.getSession(activeSession.session_key);
    } catch (error) {
      serverStatus = "Offline";
      message = error instanceof Error ? error.message : "Request failed";
    }
  }

  function focusScanner() {
    setTimeout(() => scanInput?.focus(), 20);
  }

  async function handleKeyboardRead(event: KeyboardEvent) {
    if (!["register", "inventory", "reader"].includes(page)) return;

    const now = Date.now();
    if (now - lastKeyTime > 100) keyboardBuffer = "";
    lastKeyTime = now;

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const epcs = extractEpcs(keyboardBuffer || rawBuffer);
      keyboardBuffer = "";
      rawBuffer = "";
      for (const epc of epcs) await receiveEpc(epc);
      return;
    }

    if (event.key.length === 1) {
      keyboardBuffer += event.key;
      rawBuffer += event.key;
    }
  }

  async function receiveEpc(epc: string) {
    scannedEpc = epc;
    tagStatus = "Checking tag";

    if (page === "inventory" && activeSession?.status === "open") {
      await api.postRead({ epc, sessionId: activeSession.session_key, stationId: sessionForm.stationKey });
      activeSession = await api.getSession(activeSession.session_key);
      tagStatus = "Read saved";
      return;
    }

    const result = await api.resolveTag(epc);
    tagStatus = result.known ? "Already registered" : "New tag";
  }

  async function testScan() {
    const epc = normalizeEpc(rawBuffer || scannedEpc);
    if (!epc) {
      message = "Enter or scan a valid EPC first";
      return;
    }
    await receiveEpc(epc);
  }

  async function saveTagAssociation() {
    const epc = normalizeEpc(scannedEpc);
    if (!epc) {
      message = "Scan a valid EPC before saving";
      return;
    }
    if (!newItem.name.trim()) {
      message = "Item name is required";
      return;
    }

    const created = await api.createItem(newItem);
    await api.registerTag(epc, created.item.id);
    message = "Tag association saved";
    newItem = { sku: "", name: "", category: "", description: "", photoUrl: "", notes: "" };
    await refresh();
  }

  async function createInventorySession() {
    const result = await api.createSession(sessionForm);
    activeSession = result.session;
    message = "Inventory session started";
    focusScanner();
    await refresh();
  }

  async function closeInventorySession() {
    if (!activeSession) return;
    const result = await api.closeSession(activeSession.session_key);
    activeSession = result.session;
    message = "Inventory session closed";
    await refresh();
  }

  async function openSession(sessionKey: string) {
    activeSession = await api.getSession(sessionKey);
    page = "inventory";
    focusScanner();
  }
</script>

<main class="app-shell">
  <aside class="sidebar">
    <div>
      <h1>Storage Tags</h1>
      <p class="status">Server: <strong>{serverStatus}</strong></p>
    </div>

    <nav>
      {#each navItems as item}
        <button class:active={page === item.page} on:click={() => { page = item.page; focusScanner(); }}>
          {item.label}
        </button>
      {/each}
    </nav>
  </aside>

  <section class="workspace">
    <input class="scan-capture" bind:this={scanInput} bind:value={rawBuffer} autocomplete="off" aria-label="RFID scan input" placeholder="Scan RFID tag" />

    {#if message}
      <div class="notice">{message}</div>
    {/if}

    {#if page === "inventory"}
      <header class="page-header">
        <div>
          <p class="eyebrow">Box Inventory</p>
          <h2>Active reading session</h2>
        </div>
        <div class="actions">
          <button class="secondary" on:click={refresh}>Refresh</button>
          <button on:click={createInventorySession}>Start Session</button>
          <button class="danger" disabled={!activeSession || activeSession.status !== "open"} on:click={closeInventorySession}>Stop</button>
        </div>
      </header>

      <div class="form-grid">
        <label>Station key<input bind:value={sessionForm.stationKey} /></label>
        <label>Container code<input bind:value={sessionForm.containerCode} placeholder="BOX-A12" /></label>
        <label>Location<input bind:value={sessionForm.locationName} placeholder="Warehouse Shelf 3" /></label>
        <label>Notes<input bind:value={sessionForm.notes} placeholder="Incoming products from supplier" /></label>
      </div>

      <div class="metrics">
        <div><span>{activeSession?.status ?? "No session"}</span><strong>Status</strong></div>
        <div><span>{activeSession?.reads?.length ?? 0}</span><strong>Unique tags</strong></div>
        <div><span>{activeSession?.reads?.filter((read) => read.item_name).length ?? 0}</span><strong>Known items</strong></div>
        <div><span>{activeSession?.reads?.filter((read) => !read.item_name).length ?? 0}</span><strong>Unknown tags</strong></div>
      </div>

      <table>
        <thead><tr><th>Item</th><th>EPC</th><th>Reads</th><th>Confidence</th><th>Last seen</th></tr></thead>
        <tbody>
          {#each activeSession?.reads ?? [] as read}
            <tr>
              <td>{read.item_name ?? "Unknown tag"}<small>{read.item_sku ?? "Registration needed"}</small></td>
              <td class="mono">{read.epc}</td>
              <td>{read.read_count}</td>
              <td>{confidenceLabel(read.read_count)}</td>
              <td>{read.last_seen_at ?? ""}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else if page === "register"}
      <header class="page-header">
        <div>
          <p class="eyebrow">Tag Registration</p>
          <h2>Associate EPC with an item</h2>
        </div>
        <button on:click={saveTagAssociation}>Save Tag Association</button>
      </header>

      <div class="reader-strip">
        <div><span>Scanned EPC</span><strong class="mono">{scannedEpc || "Waiting for scan"}</strong></div>
        <div><span>Tag status</span><strong>{tagStatus}</strong></div>
      </div>

      <div class="form-grid two">
        <label>Name<input bind:value={newItem.name} placeholder="Extra Virgin Olive Oil 500 ml" /></label>
        <label>SKU<input bind:value={newItem.sku} placeholder="OIL-EVO-500" /></label>
        <label>Category<input bind:value={newItem.category} placeholder="Food / Oil" /></label>
        <label>Photo URL<input bind:value={newItem.photoUrl} placeholder="https://example.com/photo.jpg" /></label>
        <label class="wide">Description<textarea bind:value={newItem.description}></textarea></label>
        <label class="wide">Notes<textarea bind:value={newItem.notes}></textarea></label>
      </div>
    {:else if page === "items"}
      <header class="page-header">
        <div>
          <p class="eyebrow">Items</p>
          <h2>Registered inventory records</h2>
        </div>
        <button class="secondary" on:click={refresh}>Refresh</button>
      </header>

      <table>
        <thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Notes</th></tr></thead>
        <tbody>
          {#each items as item}
            <tr>
              <td>{item.name}</td>
              <td>{item.sku ?? ""}</td>
              <td>{item.category ?? ""}</td>
              <td>{item.notes ?? ""}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else if page === "sessions"}
      <header class="page-header">
        <div>
          <p class="eyebrow">Sessions</p>
          <h2>Saved inventory sessions</h2>
        </div>
        <button class="secondary" on:click={refresh}>Refresh</button>
      </header>

      <table>
        <thead><tr><th>Session</th><th>Container</th><th>Location</th><th>Status</th><th>Reads</th></tr></thead>
        <tbody>
          {#each sessions as session}
            <tr on:click={() => openSession(session.session_key)}>
              <td class="mono">{session.session_key}</td>
              <td>{session.container_code ?? ""}</td>
              <td>{session.location_name ?? ""}</td>
              <td>{session.status}</td>
              <td>{session.unique_reads}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <header class="page-header">
        <div>
          <p class="eyebrow">Reader Settings</p>
          <h2>HID keyboard input bridge</h2>
        </div>
        <div class="actions">
          <button class="secondary" on:click={() => rawBuffer = ""}>Clear Buffer</button>
          <button on:click={testScan}>Test Scan</button>
        </div>
      </header>

      <div class="reader-strip">
        <div><span>Reader mode</span><strong>HID Keyboard</strong></div>
        <div><span>Last EPC</span><strong class="mono">{scannedEpc || "No scan yet"}</strong></div>
        <div><span>Status</span><strong>{tagStatus}</strong></div>
      </div>

      <label class="wide">Raw input buffer<textarea bind:value={rawBuffer} placeholder="Scan or paste raw EPC values"></textarea></label>
    {/if}
  </section>
</main>
