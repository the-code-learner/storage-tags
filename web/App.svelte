<script lang="ts">
  import { onMount } from "svelte";
  import { api, type InventorySession, type Item, type Station } from "./lib/api";
  import { confidenceLabel, extractEpcs, normalizeEpc } from "./lib/epc";

  type Page = "dashboard" | "inventory" | "register" | "items" | "sessions" | "reader" | "reports";
  type ItemForm = { sku: string; name: string; category: string; description: string; photoUrl: string; notes: string };

  const emptyItem: ItemForm = { sku: "", name: "", category: "", description: "", photoUrl: "", notes: "" };
  const navItems: { page: Page; label: string }[] = [
    { page: "dashboard", label: "Dashboard" },
    { page: "inventory", label: "Inventory" },
    { page: "register", label: "Register Tag" },
    { page: "items", label: "Items" },
    { page: "sessions", label: "Sessions" },
    { page: "reader", label: "Reader" },
    { page: "reports", label: "Reports" }
  ];

  let page: Page = "dashboard";
  let serverStatus = "Checking";
  let message = "";
  let items: Item[] = [];
  let sessions: any[] = [];
  let stations: Station[] = [];
  let unknownTags: any[] = [];
  let lastSeen: any[] = [];
  let activeSession: InventorySession | null = null;
  let selectedItemId = "";
  let editingItemId: number | null = null;
  let keyboardBuffer = "";
  let rawBuffer = "";
  let lastKeyTime = 0;
  let scannedEpc = "";
  let tagStatus = "Waiting for scan";
  let scanInput: HTMLInputElement;

  let itemForm: ItemForm = { ...emptyItem };
  let sessionForm = { stationKey: "browser-station-01", containerCode: "", locationName: "", notes: "" };
  let stationForm = { stationKey: "browser-station-01", name: "Browser Station 01", inputMode: "browser-hid", deviceLabel: "" };

  $: totalRawReads = activeSession?.reads?.reduce((sum, read) => sum + read.read_count, 0) ?? 0;
  $: knownReads = activeSession?.reads?.filter((read) => read.item_name).length ?? 0;
  $: unknownReads = activeSession?.reads?.filter((read) => !read.item_name).length ?? 0;
  $: openSessions = sessions.filter((session) => session.status === "open").length;

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
      stations = await api.listStations();
      unknownTags = await api.unknownTags();
      lastSeen = await api.itemsLastSeen();
      if (activeSession) activeSession = await api.getSession(activeSession.session_key);
    } catch (error) {
      serverStatus = "Offline";
      setMessage(error);
    }
  }

  function setMessage(value: unknown) {
    message = value instanceof Error ? value.message : String(value);
  }

  function focusScanner() {
    setTimeout(() => scanInput?.focus(), 30);
  }

  async function handleKeyboardRead(event: KeyboardEvent) {
    if (!["register", "inventory", "reader"].includes(page)) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName) && event.target !== scanInput) return;

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
    tagStatus = result.known ? `Registered to ${result.tag.item_name}` : "New tag";
  }

  async function testScan() {
    const epc = normalizeEpc(rawBuffer || scannedEpc);
    if (!epc) return setMessage("Enter or scan a valid EPC first");
    await receiveEpc(epc);
  }

  async function injectDemoRead(epc: string) {
    rawBuffer = epc;
    await receiveEpc(epc);
  }

  async function saveTagAssociation() {
    const epc = normalizeEpc(scannedEpc);
    if (!epc) return setMessage("Scan a valid EPC before saving");

    let itemId = Number(selectedItemId);
    if (!itemId) {
      if (!itemForm.name.trim()) return setMessage("Item name is required");
      const created = await api.createItem({ ...itemForm, name: itemForm.name.trim() });
      itemId = created.item.id;
    }

    await api.registerTag(epc, itemId);
    tagStatus = "Registered";
    message = "Tag association saved";
    selectedItemId = "";
    itemForm = { ...emptyItem };
    await refresh();
  }

  async function saveItem() {
    if (!itemForm.name.trim()) return setMessage("Item name is required");
    if (editingItemId) {
      await api.updateItem(editingItemId, { ...itemForm, name: itemForm.name.trim() });
      message = "Item updated";
    } else {
      await api.createItem({ ...itemForm, name: itemForm.name.trim() });
      message = "Item created";
    }
    editingItemId = null;
    itemForm = { ...emptyItem };
    await refresh();
  }

  function editItem(item: Item) {
    editingItemId = item.id;
    itemForm = {
      sku: item.sku ?? "",
      name: item.name,
      category: item.category ?? "",
      description: item.description ?? "",
      photoUrl: item.photo_url ?? "",
      notes: item.notes ?? ""
    };
    page = "items";
  }

  async function archiveItem(item: Item) {
    await api.deleteItem(item.id);
    message = "Item archived";
    await refresh();
  }

  async function createInventorySession() {
    await saveStation(false);
    const result = await api.createSession(sessionForm);
    activeSession = result.session;
    page = "inventory";
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

  async function registerUnknown(epc: string) {
    scannedEpc = epc;
    selectedItemId = "";
    itemForm = { ...emptyItem };
    page = "register";
    await receiveEpc(epc);
  }

  async function markUnknown(epc: string, status: "ignored" | "external") {
    await api.markUnknownTag(epc, status);
    message = status === "ignored" ? "Tag ignored" : "Tag marked as external";
    await refresh();
    if (activeSession) activeSession = await api.getSession(activeSession.session_key);
  }

  async function saveStation(showMessage = true) {
    await api.saveStation(stationForm.stationKey, {
      name: stationForm.name,
      inputMode: stationForm.inputMode,
      type: "browser",
      deviceLabel: stationForm.deviceLabel,
      config: { idleTimeoutMs: 100 }
    });
    sessionForm.stationKey = stationForm.stationKey;
    if (showMessage) message = "Station settings saved";
    await refresh();
  }

  async function seedDemoData() {
    const result = await api.seedDemo();
    message = result.inserted ? "Demo data loaded" : "Demo data already exists";
    await refresh();
  }

  async function backupDatabase() {
    const result = await api.backup();
    message = `Backup created at ${result.backup.path}`;
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

    <div class="sidebar-actions">
      <button class="secondary" on:click={seedDemoData}>Load Demo Data</button>
      <button class="secondary" on:click={backupDatabase}>Create Backup</button>
    </div>
  </aside>

  <section class="workspace">
    <input class="scan-capture" bind:this={scanInput} bind:value={rawBuffer} autocomplete="off" aria-label="RFID scan input" placeholder="Scan RFID tag" />

    {#if message}
      <div class="notice">{message}</div>
    {/if}

    {#if page === "dashboard"}
      <header class="page-header">
        <div>
          <p class="eyebrow">Operations</p>
          <h2>Inventory control center</h2>
        </div>
        <button on:click={createInventorySession}>Start Session</button>
      </header>

      <div class="metrics">
        <div><span>{items.length}</span><strong>Items</strong></div>
        <div><span>{sessions.length}</span><strong>Sessions</strong></div>
        <div><span>{openSessions}</span><strong>Open sessions</strong></div>
        <div><span>{unknownTags.length}</span><strong>Unknown tags</strong></div>
      </div>

      <div class="split">
        <section>
          <h3>Recent sessions</h3>
          <table>
            <thead><tr><th>Session</th><th>Container</th><th>Status</th><th>Reads</th></tr></thead>
            <tbody>
              {#each sessions.slice(0, 6) as session}
                <tr on:click={() => openSession(session.session_key)}>
                  <td class="mono">{session.session_key}</td>
                  <td>{session.container_code ?? ""}</td>
                  <td>{session.status}</td>
                  <td>{session.unique_reads}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
        <section>
          <h3>Unknown tags</h3>
          <table>
            <thead><tr><th>EPC</th><th>Reads</th><th>Action</th></tr></thead>
            <tbody>
              {#each unknownTags.slice(0, 6) as tag}
                <tr>
                  <td class="mono">{tag.epc}</td>
                  <td>{tag.total_reads}</td>
                  <td><button class="secondary compact" on:click={() => registerUnknown(tag.epc)}>Register</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      </div>
    {:else if page === "inventory"}
      <header class="page-header">
        <div>
          <p class="eyebrow">Box Inventory</p>
          <h2>Active reading session</h2>
        </div>
        <div class="actions">
          <a class:disabled={!activeSession} class="button-link" href={activeSession ? `/api/reports/session/${activeSession.session_key}/csv` : "#"}>Export CSV</a>
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
        <div><span>{totalRawReads}</span><strong>Raw reads</strong></div>
        <div><span>{knownReads} / {unknownReads}</span><strong>Known / Unknown</strong></div>
      </div>

      <div class="quick-scans">
        <button class="secondary" on:click={() => injectDemoRead("3034257BF7194E4000001A85")}>Demo Oil</button>
        <button class="secondary" on:click={() => injectDemoRead("3034257BF7194E4000001A86")}>Demo Pasta</button>
        <button class="secondary" on:click={() => injectDemoRead("E2000017221101441890ABCD")}>Demo Unknown</button>
      </div>

      <table>
        <thead><tr><th>Item</th><th>EPC</th><th>Reads</th><th>Confidence</th><th>Last seen</th><th>Actions</th></tr></thead>
        <tbody>
          {#each activeSession?.reads ?? [] as read}
            <tr>
              <td>{read.item_name ?? "Unknown tag"}<small>{read.item_sku ?? "Registration needed"}</small></td>
              <td class="mono">{read.epc}</td>
              <td>{read.read_count}</td>
              <td><span class:low={read.read_count === 1}>{confidenceLabel(read.read_count)}</span></td>
              <td>{read.last_seen_at ?? ""}</td>
              <td class="row-actions">
                {#if !read.item_name}
                  <button class="compact" on:click={() => registerUnknown(read.epc)}>Register</button>
                  <button class="secondary compact" on:click={() => markUnknown(read.epc, "external")}>External</button>
                  <button class="secondary compact" on:click={() => markUnknown(read.epc, "ignored")}>Ignore</button>
                {/if}
              </td>
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
        <div><span>Reader mode</span><strong>HID Keyboard</strong></div>
      </div>

      <label class="wide">Use existing item
        <select bind:value={selectedItemId}>
          <option value="">Create a new item</option>
          {#each items as item}
            <option value={String(item.id)}>{item.name} {item.sku ? `(${item.sku})` : ""}</option>
          {/each}
        </select>
      </label>

      {#if !selectedItemId}
        <div class="form-grid two">
          <label>Name<input bind:value={itemForm.name} placeholder="Extra Virgin Olive Oil 500 ml" /></label>
          <label>SKU<input bind:value={itemForm.sku} placeholder="OIL-EVO-500" /></label>
          <label>Category<input bind:value={itemForm.category} placeholder="Food / Oil" /></label>
          <label>Photo URL<input bind:value={itemForm.photoUrl} placeholder="https://example.com/photo.jpg" /></label>
          <label class="wide">Description<textarea bind:value={itemForm.description}></textarea></label>
          <label class="wide">Notes<textarea bind:value={itemForm.notes}></textarea></label>
        </div>
      {/if}
    {:else if page === "items"}
      <header class="page-header">
        <div>
          <p class="eyebrow">Items</p>
          <h2>Inventory records</h2>
        </div>
        <button on:click={saveItem}>{editingItemId ? "Update Item" : "Create Item"}</button>
      </header>

      <div class="form-grid two">
        <label>Name<input bind:value={itemForm.name} placeholder="Item name" /></label>
        <label>SKU<input bind:value={itemForm.sku} placeholder="SKU" /></label>
        <label>Category<input bind:value={itemForm.category} placeholder="Category" /></label>
        <label>Photo URL<input bind:value={itemForm.photoUrl} placeholder="Photo URL" /></label>
        <label class="wide">Description<textarea bind:value={itemForm.description}></textarea></label>
        <label class="wide">Notes<textarea bind:value={itemForm.notes}></textarea></label>
      </div>

      <table>
        <thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Notes</th><th>Actions</th></tr></thead>
        <tbody>
          {#each items as item}
            <tr>
              <td>{item.name}</td>
              <td>{item.sku ?? ""}</td>
              <td>{item.category ?? ""}</td>
              <td>{item.notes ?? ""}</td>
              <td class="row-actions">
                <button class="compact" on:click={() => editItem(item)}>Edit</button>
                <button class="danger compact" on:click={() => archiveItem(item)}>Archive</button>
              </td>
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
        <thead><tr><th>Session</th><th>Container</th><th>Location</th><th>Status</th><th>Unique</th><th>Raw</th></tr></thead>
        <tbody>
          {#each sessions as session}
            <tr on:click={() => openSession(session.session_key)}>
              <td class="mono">{session.session_key}</td>
              <td>{session.container_code ?? ""}</td>
              <td>{session.location_name ?? ""}</td>
              <td>{session.status}</td>
              <td>{session.unique_reads}</td>
              <td>{session.raw_reads}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else if page === "reader"}
      <header class="page-header">
        <div>
          <p class="eyebrow">Reader Settings</p>
          <h2>HID keyboard input bridge</h2>
        </div>
        <div class="actions">
          <button class="secondary" on:click={() => rawBuffer = ""}>Clear Buffer</button>
          <button class="secondary" on:click={testScan}>Test Scan</button>
          <button on:click={() => saveStation()}>Save Station</button>
        </div>
      </header>

      <div class="form-grid">
        <label>Station key<input bind:value={stationForm.stationKey} /></label>
        <label>Station name<input bind:value={stationForm.name} /></label>
        <label>Input mode<select bind:value={stationForm.inputMode}><option value="browser-hid">HID Keyboard</option><option value="browser-webserial">Web Serial</option><option value="browser-webusb">WebUSB Experimental</option></select></label>
        <label>Device label<input bind:value={stationForm.deviceLabel} placeholder="Android phone, front desk PC" /></label>
      </div>

      <div class="reader-strip">
        <div><span>Last EPC</span><strong class="mono">{scannedEpc || "No scan yet"}</strong></div>
        <div><span>Status</span><strong>{tagStatus}</strong></div>
        <div><span>Saved stations</span><strong>{stations.length}</strong></div>
      </div>

      <label class="wide">Raw input buffer<textarea bind:value={rawBuffer} placeholder="Scan or paste raw EPC values"></textarea></label>
    {:else}
      <header class="page-header">
        <div>
          <p class="eyebrow">Reports</p>
          <h2>Inventory visibility</h2>
        </div>
        <button class="secondary" on:click={refresh}>Refresh</button>
      </header>

      <div class="split">
        <section>
          <h3>Unknown tags</h3>
          <table>
            <thead><tr><th>EPC</th><th>Sessions</th><th>Total reads</th><th>Last seen</th><th>Action</th></tr></thead>
            <tbody>
              {#each unknownTags as tag}
                <tr>
                  <td class="mono">{tag.epc}</td>
                  <td>{tag.session_count}</td>
                  <td>{tag.total_reads}</td>
                  <td>{tag.last_seen_at}</td>
                  <td><button class="compact" on:click={() => registerUnknown(tag.epc)}>Register</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
        <section>
          <h3>Items last seen</h3>
          <table>
            <thead><tr><th>Item</th><th>EPC</th><th>Last seen</th><th>Reads</th></tr></thead>
            <tbody>
              {#each lastSeen as row}
                <tr>
                  <td>{row.name}<small>{row.sku ?? ""}</small></td>
                  <td class="mono">{row.epc ?? "No tag"}</td>
                  <td>{row.last_seen_at ?? "Never"}</td>
                  <td>{row.total_reads ?? 0}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      </div>
    {/if}
  </section>
</main>
