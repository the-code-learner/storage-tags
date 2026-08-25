<script lang="ts">
  import { onMount } from "svelte";
  import {
    api,
    type DashboardSummary,
    type InventorySession,
    type Item,
    type SecurityProfile,
    type Station,
    type Tag,
    type TagCatalogEntry,
    type TagEvent,
    type TagTechnology
  } from "./lib/api";
  import { extractEpcs, normalizeEpc } from "./lib/epc";
  import { startWebNfcScan, webNfcSupport, type WebNfcRead } from "./lib/nfc";

  type Page = "dashboard" | "inventory" | "tags" | "items" | "security" | "readers" | "sessions" | "reports";
  type ItemForm = { sku: string; name: string; category: string; description: string; photoUrl: string; notes: string };

  const emptyItem: ItemForm = { sku: "", name: "", category: "", description: "", photoUrl: "", notes: "" };
  const navItems: { page: Page; label: string; hint: string }[] = [
    { page: "dashboard", label: "Dashboard", hint: "Overview" },
    { page: "inventory", label: "Inventory", hint: "UHF + NFC" },
    { page: "tags", label: "Tags", hint: "Registry" },
    { page: "items", label: "Items", hint: "Assets" },
    { page: "security", label: "Security", hint: "DNA auth" },
    { page: "readers", label: "Readers", hint: "Inputs" },
    { page: "sessions", label: "Sessions", hint: "History" },
    { page: "reports", label: "Reports", hint: "Exceptions" }
  ];

  let page: Page = "dashboard";
  let loading = true;
  let serverStatus = "Checking";
  let version = "";
  let message = "";
  let errorMessage = "";

  let dashboard: DashboardSummary | null = null;
  let items: Item[] = [];
  let tags: Tag[] = [];
  let catalog: TagCatalogEntry[] = [];
  let sessions: any[] = [];
  let stations: Station[] = [];
  let profiles: SecurityProfile[] = [];
  let unknownTags: any[] = [];
  let lastSeen: any[] = [];
  let securityAlerts: Tag[] = [];
  let events: TagEvent[] = [];
  let activeSession: InventorySession | null = null;

  let keyboardBuffer = "";
  let rawBuffer = "";
  let lastKeyTime = 0;
  let scanInput: HTMLInputElement;
  let lastScannedTechnology: TagTechnology = "uhf-rain";
  let lastScannedIdentifier = "";
  let lastNdefUrl = "";
  let lastScanStatus = "Waiting for a tag";

  let tagSearch = "";
  let tagTechnology: "" | TagTechnology = "";
  let tagStatusFilter = "";
  let selectedTag: Tag | null = null;
  let tagForm = { technology: "uhf-rain" as TagTechnology, identifier: "", itemId: "", catalogKey: "generic-rain", securityProfileKey: "" };

  let itemForm: ItemForm = { ...emptyItem };
  let editingItemId: number | null = null;
  let sessionForm = { stationKey: "browser-station-01", containerCode: "", locationName: "", notes: "" };
  let stationForm = { stationKey: "browser-station-01", name: "Browser Station 01", inputMode: "browser-hid", deviceLabel: "" };
  let profileForm = {
    profileKey: "",
    name: "",
    technology: "nfc" as TagTechnology,
    verifier: "ntag424-sdm" as SecurityProfile["verifier"],
    keyRef: "",
    configJson: "{}"
  };

  let nfcState = webNfcSupport();
  let stopNfc: (() => void) | null = null;
  let nfcScanning = false;

  $: filteredTags = tags.filter((tag) => {
    const text = tagSearch.trim().toLowerCase();
    const matchesText = !text || [tag.identifier, tag.item_name, tag.item_sku, tag.chip_model, tag.product_family].some((value) => value?.toLowerCase().includes(text));
    return matchesText && (!tagTechnology || tag.technology === tagTechnology) && (!tagStatusFilter || tag.status === tagStatusFilter);
  });
  $: totalRawReads = activeSession?.reads?.reduce((sum, read) => sum + read.read_count, 0) ?? 0;
  $: inventoryAlerts = activeSession?.reads?.filter((read) => ["failed", "replay", "error"].includes(read.auth_status) || ["open", "invalid"].includes(read.tamper_status) || read.permanent_tamper_status === "opened-once").length ?? 0;

  onMount(async () => {
    window.addEventListener("keydown", handleKeyboardRead);
    await refresh();
    focusScanner();
    return () => {
      window.removeEventListener("keydown", handleKeyboardRead);
      stopNfc?.();
    };
  });

  function setNotice(value: string) {
    message = value;
    errorMessage = "";
  }

  function setError(value: unknown) {
    errorMessage = value instanceof Error ? value.message : String(value);
    message = "";
  }

  async function refresh() {
    loading = true;
    try {
      const [health, dashboardResult, itemRows, tagRows, catalogRows, sessionRows, stationRows, profileRows, unknownRows, lastSeenRows, alertRows, eventRows] = await Promise.all([
        api.health(), api.dashboard(), api.listItems(), api.listTags(), api.tagCatalog(), api.listSessions(), api.listStations(), api.listSecurityProfiles(), api.unknownTags(), api.itemsLastSeen(), api.securityAlerts(100), api.recentEvents(100)
      ]);
      serverStatus = health.ok ? "Online" : "Offline";
      version = health.version;
      dashboard = dashboardResult;
      items = itemRows;
      tags = tagRows;
      catalog = catalogRows;
      sessions = sessionRows;
      stations = stationRows;
      profiles = profileRows;
      unknownTags = unknownRows;
      lastSeen = lastSeenRows;
      securityAlerts = alertRows;
      events = eventRows;
      if (activeSession) activeSession = await api.getSession(activeSession.session_key);
    } catch (error) {
      serverStatus = "Offline";
      setError(error);
    } finally {
      loading = false;
    }
  }

  function focusScanner() { setTimeout(() => scanInput?.focus(), 20); }
  function navigate(next: Page) { page = next; if (["inventory", "tags", "readers"].includes(next)) focusScanner(); }
  function statusTone(value: string) {
    if (["verified", "active", "open", "online", "closed", "sealed"].includes(value.toLowerCase())) return "good";
    if (["failed", "error", "replay", "invalid", "opened-once"].includes(value.toLowerCase())) return "danger";
    if (["pending", "unsupported", "unknown"].includes(value.toLowerCase())) return "warn";
    return "neutral";
  }
  function formatDate(value?: string | null) { return value ? new Date(value).toLocaleString() : "—"; }

  async function handleKeyboardRead(event: KeyboardEvent) {
    if (!["inventory", "tags", "readers"].includes(page)) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName) && event.target !== scanInput) return;
    const now = Date.now();
    if (now - lastKeyTime > 100) keyboardBuffer = "";
    lastKeyTime = now;
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const epcs = extractEpcs(keyboardBuffer || rawBuffer);
      keyboardBuffer = ""; rawBuffer = "";
      for (const epc of epcs) await receiveUhf(epc);
      return;
    }
    if (event.key.length === 1) { keyboardBuffer += event.key; rawBuffer += event.key; }
  }

  async function receiveUhf(rawEpc: string) {
    try {
      const epc = normalizeEpc(rawEpc);
      if (!epc) throw new Error("Invalid UHF EPC");
      lastScannedTechnology = "uhf-rain"; lastScannedIdentifier = epc; lastNdefUrl = "";
      const result = await api.postObservation({ technology: "uhf-rain", identifier: epc, epc, source: "browser-hid", stationKey: sessionForm.stationKey || undefined, sessionKey: activeSession?.status === "open" ? activeSession.session_key : undefined });
      lastScanStatus = result.known ? `Known tag · ${result.item?.name ?? "registered"}` : "Unknown UHF tag";
      tagForm = { ...tagForm, technology: "uhf-rain", identifier: epc, catalogKey: "generic-rain" };
      if (activeSession) activeSession = await api.getSession(activeSession.session_key);
      await refreshSummaryOnly();
    } catch (error) { setError(error); }
  }

  async function refreshSummaryOnly() {
    dashboard = await api.dashboard(); tags = await api.listTags(); unknownTags = await api.unknownTags(); securityAlerts = await api.securityAlerts(100); events = await api.recentEvents(100);
  }

  async function toggleNfc() {
    if (nfcScanning) { stopNfc?.(); stopNfc = null; nfcScanning = false; setNotice("Web NFC scan stopped"); return; }
    try {
      nfcState = webNfcSupport();
      stopNfc = await startWebNfcScan(handleNfcRead, setError);
      nfcScanning = true;
      setNotice("Web NFC active — tap a tag to the phone");
    } catch (error) { setError(error); }
  }

  async function handleNfcRead(read: WebNfcRead) {
    try {
      const identifier = read.serialNumber || lastScannedIdentifier;
      if (!identifier) throw new Error("NFC read did not expose a serial number. Register the tag through a reader bridge or select its known identity first.");
      lastScannedTechnology = "nfc"; lastScannedIdentifier = identifier; lastNdefUrl = read.url ?? "";
      tagForm = { ...tagForm, technology: "nfc", identifier, catalogKey: tagForm.technology === "nfc" ? tagForm.catalogKey : "generic-nfc-ndef" };
      const resolved = await api.resolveTag("nfc", identifier);
      if (resolved.known && resolved.tag?.security_profile_key && read.url) {
        const result = await api.verifyTag({ technology: "nfc", identifier, url: read.url, source: "browser-webnfc", stationKey: sessionForm.stationKey || undefined, sessionKey: activeSession?.status === "open" ? activeSession.session_key : undefined });
        lastScanStatus = `${result.authStatus}${result.tamperStatus && result.tamperStatus !== "unknown" ? ` · tamper ${result.tamperStatus}` : ""}`;
      } else {
        const result = await api.postObservation({ technology: "nfc", identifier, uid: identifier, source: "browser-webnfc", stationKey: sessionForm.stationKey || undefined, sessionKey: activeSession?.status === "open" ? activeSession.session_key : undefined, ndefUrl: read.url, payload: { records: read.records } });
        lastScanStatus = result.known ? `Known NFC tag · ${result.item?.name ?? "registered"}` : "Unknown NFC tag";
      }
      if (activeSession) activeSession = await api.getSession(activeSession.session_key);
      await refreshSummaryOnly();
    } catch (error) { setError(error); }
  }

  async function testManualUhf() { const epc = normalizeEpc(rawBuffer || lastScannedIdentifier); if (!epc) return setError("Enter a valid EPC"); await receiveUhf(epc); }

  async function saveTag() {
    try {
      if (!tagForm.identifier.trim()) throw new Error("Tag identifier is required");
      await api.registerTag({ technology: tagForm.technology, identifier: tagForm.identifier.trim(), epc: tagForm.technology === "uhf-rain" ? tagForm.identifier.trim() : undefined, uid: tagForm.technology === "nfc" ? tagForm.identifier.trim() : undefined, itemId: tagForm.itemId ? Number(tagForm.itemId) : undefined, catalogKey: tagForm.catalogKey || undefined, securityProfileKey: tagForm.securityProfileKey || undefined });
      setNotice("Tag registry updated"); await refresh();
    } catch (error) { setError(error); }
  }

  function editTag(tag: Tag) {
    selectedTag = tag;
    tagForm = { technology: tag.technology, identifier: tag.identifier, itemId: tag.item_id ? String(tag.item_id) : "", catalogKey: catalog.find((entry) => entry.chipModel === tag.chip_model && entry.technology === tag.technology)?.key ?? (tag.technology === "nfc" ? "generic-nfc-ndef" : "generic-rain"), securityProfileKey: tag.security_profile_key ?? "" };
    page = "tags";
  }

  async function markTag(tag: Tag, status: "active" | "inactive" | "ignored" | "external") { try { await api.setTagStatus(tag.technology, tag.identifier, status); setNotice(`Tag marked ${status}`); await refresh(); } catch (error) { setError(error); } }

  async function saveItem() {
    try {
      if (!itemForm.name.trim()) throw new Error("Item name is required");
      if (editingItemId) await api.updateItem(editingItemId, { ...itemForm, name: itemForm.name.trim() }); else await api.createItem({ ...itemForm, name: itemForm.name.trim() });
      setNotice(editingItemId ? "Item updated" : "Item created"); editingItemId = null; itemForm = { ...emptyItem }; await refresh();
    } catch (error) { setError(error); }
  }

  function editItem(item: Item) { editingItemId = item.id; itemForm = { sku: item.sku ?? "", name: item.name, category: item.category ?? "", description: item.description ?? "", photoUrl: item.photo_url ?? "", notes: item.notes ?? "" }; }
  async function archiveItem(item: Item) { try { await api.deleteItem(item.id); setNotice("Item archived and linked tags deactivated"); await refresh(); } catch (error) { setError(error); } }

  async function saveStation(showMessage = true) {
    try {
      await api.saveStation(stationForm.stationKey, { name: stationForm.name || stationForm.stationKey, inputMode: stationForm.inputMode, type: stationForm.inputMode === "reader-bridge" ? "bridge" : "browser", deviceLabel: stationForm.deviceLabel, config: { idleTimeoutMs: 100 } });
      sessionForm.stationKey = stationForm.stationKey; if (showMessage) setNotice("Station saved"); stations = await api.listStations();
    } catch (error) { setError(error); }
  }

  async function createInventorySession() { try { await saveStation(false); const result = await api.createSession(sessionForm); activeSession = result.session; page = "inventory"; setNotice("Inventory session started"); await refresh(); focusScanner(); } catch (error) { setError(error); } }
  async function closeInventorySession() { if (!activeSession) return; try { const result = await api.closeSession(activeSession.session_key); activeSession = result.session; setNotice("Inventory session closed"); await refresh(); } catch (error) { setError(error); } }
  async function openSession(sessionKey: string) { try { activeSession = await api.getSession(sessionKey); page = "inventory"; focusScanner(); } catch (error) { setError(error); } }

  function editProfile(profile: SecurityProfile) { profileForm = { profileKey: profile.profile_key, name: profile.name, technology: profile.technology, verifier: profile.verifier, keyRef: profile.key_ref ?? "", configJson: profile.config_json ?? "{}" }; }
  async function saveProfile() {
    try {
      if (!profileForm.profileKey.trim() || !profileForm.name.trim()) throw new Error("Profile key and name are required");
      const config = JSON.parse(profileForm.configJson || "{}");
      await api.saveSecurityProfile(profileForm.profileKey.trim(), { name: profileForm.name.trim(), technology: profileForm.technology, verifier: profileForm.verifier, keyRef: profileForm.keyRef.trim() || undefined, config });
      setNotice("Security profile saved. Only the key reference is stored; key material remains server-side."); profiles = await api.listSecurityProfiles();
    } catch (error) { setError(error); }
  }

  async function verifySelectedTag() {
    if (!lastScannedIdentifier) return setError("Scan or select a tag first");
    try {
      const result = await api.verifyTag({ technology: lastScannedTechnology, identifier: lastScannedIdentifier, url: lastNdefUrl || undefined, source: lastScannedTechnology === "nfc" ? "browser-webnfc" : "reader-bridge", stationKey: sessionForm.stationKey || undefined, sessionKey: activeSession?.status === "open" ? activeSession.session_key : undefined });
      lastScanStatus = result.authStatus; setNotice(`Verification result: ${result.authStatus}`); await refresh();
    } catch (error) { setError(error); }
  }

  async function seedDemoData() { try { const result = await api.seedDemo(); setNotice(result.inserted ? "Demo data loaded" : "Demo data already exists"); await refresh(); } catch (error) { setError(error); } }
  async function backupDatabase() { try { const result = await api.backup(); setNotice(`Backup created: ${result.backup.path}`); } catch (error) { setError(error); } }
</script>

<main class="app-shell">
  <aside class="sidebar">
    <div class="brand-block"><div class="brand-mark">ST</div><div><h1>Storage Tags</h1><p>Inventory + authenticity</p></div></div>
    <nav aria-label="Primary navigation">{#each navItems as item}<button class:active={page === item.page} on:click={() => navigate(item.page)}><span>{item.label}</span><small>{item.hint}</small></button>{/each}</nav>
    <div class="sidebar-footer"><div class="server-line"><span class:online={serverStatus === "Online"} class="dot"></span><strong>{serverStatus}</strong><small>{version || "—"}</small></div><button class="quiet" on:click={refresh}>Refresh data</button></div>
  </aside>

  <section class="workspace">
    <input class="scan-capture" bind:this={scanInput} bind:value={rawBuffer} autocomplete="off" aria-label="UHF keyboard reader capture" />
    <header class="context-bar"><div><p class="eyebrow">{page}</p><h2>{navItems.find((item) => item.page === page)?.label}</h2></div><div class="context-actions">{#if activeSession}<span class="context-chip"><strong>{activeSession.session_key}</strong> · {activeSession.status}</span>{/if}<button class="secondary" on:click={backupDatabase}>Backup</button><button on:click={createInventorySession}>New session</button></div></header>
    {#if message}<div class="notice success" role="status">{message}<button on:click={() => message = ""}>×</button></div>{/if}
    {#if errorMessage}<div class="notice error" role="alert">{errorMessage}<button on:click={() => errorMessage = ""}>×</button></div>{/if}

    {#if loading}
      <div class="state-panel"><strong>Loading operational data…</strong><span>Refreshing tags, sessions, security state and reader configuration.</span></div>
    {:else if page === "dashboard"}
      <section class="metric-strip" aria-label="Operational metrics">
        <article><span>Active items</span><strong>{dashboard?.counts.active_items ?? 0}</strong><small>{dashboard?.counts.active_tags ?? 0} linked tags</small></article>
        <article><span>RAIN / UHF</span><strong>{dashboard?.counts.uhf_tags ?? 0}</strong><small>bulk inventory identities</small></article>
        <article><span>NFC</span><strong>{dashboard?.counts.nfc_tags ?? 0}</strong><small>{dashboard?.counts.secured_tags ?? 0} security profiles</small></article>
        <article class:metric-alert={(dashboard?.counts.auth_alerts ?? 0) > 0}><span>Auth alerts</span><strong>{dashboard?.counts.auth_alerts ?? 0}</strong><small>failed, replay or error</small></article>
        <article class:metric-alert={(dashboard?.counts.tamper_alerts ?? 0) > 0}><span>Tamper alerts</span><strong>{dashboard?.counts.tamper_alerts ?? 0}</strong><small>current or permanent</small></article>
      </section>
      <div class="dashboard-grid">
        <section class="panel span-2"><div class="panel-head"><div><h3>Needs attention</h3><p>Authentication and tamper exceptions requiring an operator decision.</p></div><button class="quiet" on:click={() => navigate("security")}>Open security</button></div>
          {#if securityAlerts.length === 0}<div class="empty-row">No security exceptions. Fresh verified events will appear in the event stream.</div>{:else}<div class="table-wrap"><table><thead><tr><th>Item / tag</th><th>Technology</th><th>Authentication</th><th>Current tamper</th><th>Permanent</th><th>Last seen</th></tr></thead><tbody>{#each securityAlerts.slice(0, 8) as tag}<tr on:click={() => editTag(tag)}><td><strong>{tag.item_name ?? "Unassigned tag"}</strong><small class="mono">{tag.identifier}</small></td><td><span class="badge">{tag.technology}</span><small>{tag.chip_model ?? tag.product_family ?? "generic"}</small></td><td><span class="status-pill {statusTone(tag.last_auth_status)}">{tag.last_auth_status}</span></td><td><span class="status-pill {statusTone(tag.last_tamper_status)}">{tag.last_tamper_status}</span></td><td><span class="status-pill {statusTone(tag.permanent_tamper_status)}">{tag.permanent_tamper_status}</span></td><td>{formatDate(tag.last_seen_at)}</td></tr>{/each}</tbody></table></div>{/if}
        </section>
        <section class="panel"><div class="panel-head"><div><h3>Reader readiness</h3><p>Inputs available to this browser.</p></div></div><dl class="status-list"><div><dt>UHF keyboard/HID</dt><dd><span class="status-pill good">ready</span></dd></div><div><dt>Web NFC</dt><dd><span class="status-pill {nfcState.ready ? 'good' : 'warn'}">{nfcState.ready ? "ready" : "unavailable"}</span></dd></div><div><dt>Authenticated reader bridge</dt><dd><span class="status-pill warn">not configured</span></dd></div><div><dt>Open inventory sessions</dt><dd><strong>{dashboard?.counts.open_sessions ?? 0}</strong></dd></div></dl><button class="secondary full" on:click={() => navigate("readers")}>Configure readers</button></section>
        <section class="panel span-3"><div class="panel-head"><div><h3>Recent tag events</h3><p>Immutable point scans, verification outcomes and status transitions.</p></div><button class="quiet" on:click={() => navigate("reports")}>View reports</button></div>{#if (dashboard?.recentEvents.length ?? 0) === 0}<div class="empty-row">No NFC/security events recorded yet.</div>{:else}<div class="table-wrap"><table><thead><tr><th>Time</th><th>Event</th><th>Item / identifier</th><th>Technology</th><th>Auth</th><th>Tamper</th><th>Source</th></tr></thead><tbody>{#each dashboard?.recentEvents ?? [] as event}<tr><td>{formatDate(event.occurred_at)}</td><td>{event.event_kind}</td><td><strong>{event.item_name ?? "Unassigned"}</strong><small class="mono">{event.identifier}</small></td><td><span class="badge">{event.technology}</span></td><td><span class="status-pill {statusTone(event.auth_status)}">{event.auth_status}</span></td><td><span class="status-pill {statusTone(event.tamper_status)}">{event.tamper_status}</span></td><td>{event.source}</td></tr>{/each}</tbody></table></div>{/if}</section>
      </div>

    {:else if page === "inventory"}
      <div class="action-band"><div class="form-row compact-fields"><label>Station<input bind:value={sessionForm.stationKey} /></label><label>Container<input bind:value={sessionForm.containerCode} placeholder="BOX-A12" /></label><label>Location<input bind:value={sessionForm.locationName} placeholder="Shelf / room" /></label><label>Notes<input bind:value={sessionForm.notes} placeholder="Optional context" /></label></div><div class="actions"><button on:click={createInventorySession}>Start</button><button class="danger" disabled={!activeSession || activeSession.status !== "open"} on:click={closeInventorySession}>Close session</button>{#if activeSession}<a class="button-link secondary" href={`/api/reports/session/${activeSession.session_key}/csv`}>Export CSV</a>{/if}</div></div>
      <section class="metric-strip four"><article><span>Session</span><strong class="metric-text">{activeSession?.status ?? "none"}</strong><small>{activeSession?.container_code ?? "Start or open a session"}</small></article><article><span>Unique identities</span><strong>{activeSession?.reads.length ?? 0}</strong><small>NFC + RAIN</small></article><article><span>Raw reads</span><strong>{totalRawReads}</strong><small>aggregated per identity</small></article><article class:metric-alert={inventoryAlerts > 0}><span>Exceptions</span><strong>{inventoryAlerts}</strong><small>auth or tamper</small></article></section>
      <section class="panel scan-console"><div class="panel-head"><div><h3>Capture</h3><p>UHF keyboard/HID for bulk reads; Web NFC for point verification.</p></div><span class="context-chip mono">{lastScannedIdentifier || "waiting"}</span></div><div class="capture-grid"><div><strong>UHF / RAIN</strong><p>Focus remains on the hidden scanner input. Paste an EPC here for manual testing.</p><div class="inline-input"><input bind:value={rawBuffer} placeholder="EPC hex" /><button on:click={testManualUhf}>Read EPC</button></div></div><div><strong>NFC / Web NFC</strong><p>{nfcState.reason}</p><button class:nfc-live={nfcScanning} disabled={!nfcState.ready} on:click={toggleNfc}>{nfcScanning ? "Stop NFC" : "Start Web NFC"}</button></div><div><strong>Last result</strong><p>{lastScanStatus}</p>{#if lastNdefUrl}<small class="mono break">{lastNdefUrl}</small>{/if}</div></div></section>
      <section class="panel"><div class="panel-head"><div><h3>Session observations</h3><p>Operational counts with latest verification and tamper state.</p></div></div>{#if !activeSession}<div class="state-panel"><strong>No session selected</strong><span>Start a new session or open one from Sessions.</span></div>{:else if activeSession.reads.length === 0}<div class="empty-row">Session is open. Scan UHF tags or tap NFC tags to begin.</div>{:else}<div class="table-wrap"><table><thead><tr><th>Item</th><th>Identifier</th><th>Technology</th><th>Reads</th><th>Auth</th><th>Current tamper</th><th>Permanent</th><th>Last seen</th></tr></thead><tbody>{#each activeSession.reads as read}<tr><td><strong>{read.item_name ?? "Unknown tag"}</strong><small>{read.item_sku ?? "Registration needed"}</small></td><td class="mono">{read.identifier}<small>{read.chip_model ?? read.product_family ?? ""}</small></td><td><span class="badge">{read.technology}</span></td><td>{read.read_count}</td><td><span class="status-pill {statusTone(read.auth_status)}">{read.auth_status}</span></td><td><span class="status-pill {statusTone(read.tamper_status)}">{read.tamper_status}</span></td><td><span class="status-pill {statusTone(read.permanent_tamper_status)}">{read.permanent_tamper_status}</span></td><td>{formatDate(read.last_seen_at)}</td></tr>{/each}</tbody></table></div>{/if}</section>

    {:else if page === "tags"}
      <div class="two-column"><section class="panel inspector"><div class="panel-head"><div><h3>Register / assign tag</h3><p>One item can own multiple NFC and RAIN identities.</p></div></div><div class="form-stack"><label>Technology<select bind:value={tagForm.technology} on:change={() => { tagForm.catalogKey = tagForm.technology === "nfc" ? "generic-nfc-ndef" : "generic-rain"; }}><option value="uhf-rain">RAIN / UHF</option><option value="nfc">NFC</option></select></label><label>Identifier<input class="mono" bind:value={tagForm.identifier} placeholder={tagForm.technology === "nfc" ? "NFC UID / serial" : "EPC"} /></label><label>Product / chip<select bind:value={tagForm.catalogKey}>{#each catalog.filter((entry) => entry.technology === tagForm.technology) as entry}<option value={entry.key}>{entry.label}</option>{/each}</select></label><label>Inventory item<select bind:value={tagForm.itemId}><option value="">Unassigned</option>{#each items as item}<option value={item.id}>{item.sku ? `${item.sku} · ` : ""}{item.name}</option>{/each}</select></label><label>Security profile<select bind:value={tagForm.securityProfileKey}><option value="">None / not configured</option>{#each profiles.filter((profile) => profile.technology === tagForm.technology && profile.status === "active") as profile}<option value={profile.profile_key}>{profile.name}</option>{/each}</select></label><button on:click={saveTag}>Save tag</button></div>{#if selectedTag}<div class="inspector-note"><strong>Selected</strong><span class="mono">{selectedTag.identifier}</span><span>{selectedTag.product_family ?? selectedTag.chip_model ?? "Generic tag"}</span></div>{/if}</section>
        <section class="panel main-list"><div class="panel-head"><div><h3>Tag registry</h3><p>Technology, ownership, product identity and last security state.</p></div><span>{filteredTags.length} results</span></div><div class="filter-bar"><input bind:value={tagSearch} placeholder="Search identifier, item, chip…" /><select bind:value={tagTechnology}><option value="">All technologies</option><option value="uhf-rain">RAIN / UHF</option><option value="nfc">NFC</option></select><select bind:value={tagStatusFilter}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="external">External</option><option value="ignored">Ignored</option></select></div>{#if filteredTags.length === 0}<div class="empty-row">No tags match the active filters.</div>{:else}<div class="table-wrap"><table><thead><tr><th>Item / identifier</th><th>Technology</th><th>Chip / product</th><th>Auth</th><th>Tamper</th><th>Status</th><th>Actions</th></tr></thead><tbody>{#each filteredTags as tag}<tr class:selected={selectedTag?.id === tag.id}><td on:click={() => editTag(tag)}><strong>{tag.item_name ?? "Unassigned"}</strong><small class="mono">{tag.identifier}</small></td><td><span class="badge">{tag.technology}</span></td><td>{tag.chip_model ?? "Generic"}<small>{tag.product_family ?? tag.part_number ?? ""}</small></td><td><span class="status-pill {statusTone(tag.last_auth_status)}">{tag.last_auth_status}</span></td><td><span class="status-pill {statusTone(tag.last_tamper_status)}">{tag.last_tamper_status}</span><small>perm: {tag.permanent_tamper_status}</small></td><td><span class="status-pill {statusTone(tag.status)}">{tag.status}</span></td><td class="row-actions"><button class="quiet compact" on:click={() => editTag(tag)}>Edit</button>{#if tag.status === "active"}<button class="quiet compact" on:click={() => markTag(tag, "inactive")}>Deactivate</button>{:else}<button class="quiet compact" on:click={() => markTag(tag, "active")}>Activate</button>{/if}</td></tr>{/each}</tbody></table></div>{/if}</section>
      </div>

    {:else if page === "items"}
      <div class="two-column"><section class="panel inspector"><div class="panel-head"><div><h3>{editingItemId ? "Edit item" : "Create item"}</h3><p>Inventory metadata independent from tag technology.</p></div></div><div class="form-stack"><label>SKU<input bind:value={itemForm.sku} /></label><label>Name<input bind:value={itemForm.name} /></label><label>Category<input bind:value={itemForm.category} /></label><label>Description<textarea bind:value={itemForm.description}></textarea></label><label>Photo URL<input bind:value={itemForm.photoUrl} /></label><label>Notes<textarea bind:value={itemForm.notes}></textarea></label><div class="actions"><button on:click={saveItem}>{editingItemId ? "Update" : "Create"}</button>{#if editingItemId}<button class="secondary" on:click={() => { editingItemId = null; itemForm = { ...emptyItem }; }}>Cancel</button>{/if}</div></div></section>
        <section class="panel main-list"><div class="panel-head"><div><h3>Inventory items</h3><p>Assets with linked NFC and RAIN identities.</p></div><span>{items.length} active</span></div>{#if items.length === 0}<div class="state-panel"><strong>No items yet</strong><span>Create an item or load demo data from Reports.</span></div>{:else}<div class="table-wrap"><table><thead><tr><th>Item</th><th>Category</th><th>Tags</th><th>NFC</th><th>RAIN</th><th>Actions</th></tr></thead><tbody>{#each items as item}<tr><td><strong>{item.name}</strong><small>{item.sku ?? "No SKU"}</small></td><td>{item.category ?? "—"}</td><td>{item.tag_count ?? 0}</td><td>{item.nfc_tag_count ?? 0}</td><td>{item.uhf_tag_count ?? 0}</td><td class="row-actions"><button class="quiet compact" on:click={() => editItem(item)}>Edit</button><button class="danger compact" on:click={() => archiveItem(item)}>Archive</button></td></tr>{/each}</tbody></table></div>{/if}</section>
      </div>

    {:else if page === "security"}
      <section class="metric-strip four"><article><span>Secured tags</span><strong>{dashboard?.counts.secured_tags ?? 0}</strong><small>assigned profiles</small></article><article class:metric-alert={(dashboard?.counts.auth_alerts ?? 0) > 0}><span>Auth alerts</span><strong>{dashboard?.counts.auth_alerts ?? 0}</strong><small>failed / replay / error</small></article><article class:metric-alert={(dashboard?.counts.tamper_alerts ?? 0) > 0}><span>Tamper alerts</span><strong>{dashboard?.counts.tamper_alerts ?? 0}</strong><small>current + permanent</small></article><article><span>Profiles</span><strong>{profiles.length}</strong><small>SUN, SDM, reader bridge</small></article></section>
      <div class="two-column security-layout"><section class="panel inspector"><div class="panel-head"><div><h3>Verification profile</h3><p>References a server-mounted key. Never enter AES key material here.</p></div></div><div class="form-stack"><label>Profile key<input class="mono" bind:value={profileForm.profileKey} placeholder="oil-424-sdm" /></label><label>Name<input bind:value={profileForm.name} placeholder="Olive oil NTAG 424" /></label><label>Technology<select bind:value={profileForm.technology}><option value="nfc">NFC</option><option value="uhf-rain">RAIN / UHF</option></select></label><label>Verifier<select bind:value={profileForm.verifier}><option value="ntag424-sdm">NTAG 424 SDM</option><option value="ntag22x-sun">NTAG 22x SUN</option><option value="reader-bridge">Authenticated reader bridge</option></select></label><label>Key reference<input class="mono" bind:value={profileForm.keyRef} placeholder="production/oil-sdm-file-read.key" /></label><label>Verifier config (JSON)<textarea class="mono" rows="8" bind:value={profileForm.configJson}></textarea></label><button on:click={saveProfile}>Save profile</button></div></section>
        <section class="panel main-list"><div class="panel-head"><div><h3>Profiles and alerts</h3><p>Self-hosted verification configuration plus current exceptions.</p></div><button disabled={!lastScannedIdentifier} on:click={verifySelectedTag}>Verify last scan</button></div><h4>Profiles</h4>{#if profiles.length === 0}<div class="empty-row">No verification profiles configured. Sample tags must be inspected before provisioning assumptions are made.</div>{:else}<div class="table-wrap"><table><thead><tr><th>Profile</th><th>Technology</th><th>Verifier</th><th>Key reference</th><th>Status</th></tr></thead><tbody>{#each profiles as profile}<tr on:click={() => editProfile(profile)}><td><strong>{profile.name}</strong><small class="mono">{profile.profile_key}</small></td><td><span class="badge">{profile.technology}</span></td><td>{profile.verifier}</td><td class="mono">{profile.key_ref ?? "—"}</td><td><span class="status-pill {statusTone(profile.status)}">{profile.status}</span></td></tr>{/each}</tbody></table></div>{/if}<h4>Current security alerts</h4>{#if securityAlerts.length === 0}<div class="empty-row">No active security alerts.</div>{:else}<div class="table-wrap"><table><thead><tr><th>Tag</th><th>Item</th><th>Auth</th><th>Counter</th><th>Tamper</th><th>Permanent</th></tr></thead><tbody>{#each securityAlerts as tag}<tr on:click={() => editTag(tag)}><td class="mono">{tag.identifier}<small>{tag.chip_model ?? ""}</small></td><td>{tag.item_name ?? "Unassigned"}</td><td><span class="status-pill {statusTone(tag.last_auth_status)}">{tag.last_auth_status}</span></td><td>{tag.last_auth_counter ?? "—"}</td><td>{tag.last_tamper_status}</td><td>{tag.permanent_tamper_status}</td></tr>{/each}</tbody></table></div>{/if}</section>
      </div>

    {:else if page === "readers"}
      <div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h3>Web NFC</h3><p>Point verification on Android Chrome, baseline Pixel 7 Pro or newer.</p></div></div><div class="reader-state"><span class="status-pill {nfcState.ready ? 'good' : 'warn'}">{nfcState.ready ? "ready" : "unavailable"}</span><p>{nfcState.reason}</p><button disabled={!nfcState.ready} class:nfc-live={nfcScanning} on:click={toggleNfc}>{nfcScanning ? "Stop Web NFC" : "Start Web NFC"}</button></div></section><section class="panel"><div class="panel-head"><div><h3>UHF keyboard / HID</h3><p>Bulk EPC capture from readers that emulate a keyboard.</p></div></div><div class="reader-state"><span class="status-pill good">ready</span><p>100 ms scan grouping. Works without a hardware-specific driver.</p><div class="inline-input"><input bind:value={rawBuffer} placeholder="Paste EPC" /><button on:click={testManualUhf}>Test</button></div></div></section><section class="panel"><div class="panel-head"><div><h3>Authenticated reader bridge</h3><p>Required for low-level NFC mutual auth/protected memory and UCODE DNA challenge-response.</p></div></div><div class="reader-state"><span class="status-pill warn">hardware pending</span><p>No USB NFC or authenticated RAIN reader model has been selected. The backend contract is ready; vendor binding waits for hardware selection.</p></div></section><section class="panel span-3"><div class="panel-head"><div><h3>Stations</h3><p>Persistent logical endpoints used by sessions and event attribution.</p></div></div><div class="form-row"><label>Key<input bind:value={stationForm.stationKey} /></label><label>Name<input bind:value={stationForm.name} /></label><label>Input mode<select bind:value={stationForm.inputMode}><option value="browser-hid">Browser HID</option><option value="browser-webnfc">Browser Web NFC</option><option value="reader-bridge">Reader bridge</option></select></label><label>Device label<input bind:value={stationForm.deviceLabel} /></label><button on:click={() => saveStation(true)}>Save station</button></div><div class="table-wrap"><table><thead><tr><th>Station</th><th>Type</th><th>Input</th><th>Device</th></tr></thead><tbody>{#each stations as station}<tr on:click={() => stationForm = { stationKey: station.station_key, name: station.name, inputMode: station.input_mode, deviceLabel: station.device_label ?? "" }}><td><strong>{station.name}</strong><small class="mono">{station.station_key}</small></td><td>{station.type}</td><td>{station.input_mode}</td><td>{station.device_label ?? "—"}</td></tr>{/each}</tbody></table></div></section></div>

    {:else if page === "sessions"}
      <section class="panel"><div class="panel-head"><div><h3>Inventory sessions</h3><p>Mixed RAIN bulk observations and NFC point verification in one audit context.</p></div><button on:click={createInventorySession}>New session</button></div>{#if sessions.length === 0}<div class="empty-row">No inventory sessions yet.</div>{:else}<div class="table-wrap"><table><thead><tr><th>Session</th><th>Location / container</th><th>Status</th><th>Unique</th><th>RAIN</th><th>NFC</th><th>Auth alerts</th><th>Tamper</th><th>Started</th></tr></thead><tbody>{#each sessions as session}<tr on:click={() => openSession(session.session_key)}><td class="mono">{session.session_key}</td><td>{session.location_name ?? "—"}<small>{session.container_code ?? ""}</small></td><td><span class="status-pill {statusTone(session.status)}">{session.status}</span></td><td>{session.unique_reads}</td><td>{session.uhf_reads ?? 0}</td><td>{session.nfc_reads ?? 0}</td><td>{session.auth_alerts ?? 0}</td><td>{session.tamper_alerts ?? 0}</td><td>{formatDate(session.started_at)}</td></tr>{/each}</tbody></table></div>{/if}</section>

    {:else if page === "reports"}
      <div class="dashboard-grid reports-grid"><section class="panel span-2"><div class="panel-head"><div><h3>Unknown observed tags</h3><p>Identifiers seen in sessions without an active registry record.</p></div></div>{#if unknownTags.length === 0}<div class="empty-row">No unknown observed identifiers.</div>{:else}<div class="table-wrap"><table><thead><tr><th>Technology</th><th>Identifier</th><th>Sessions</th><th>Reads</th><th>Last seen</th></tr></thead><tbody>{#each unknownTags as row}<tr><td><span class="badge">{row.technology}</span></td><td class="mono">{row.identifier}</td><td>{row.session_count}</td><td>{row.total_reads}</td><td>{formatDate(row.last_seen_at)}</td></tr>{/each}</tbody></table></div>{/if}</section><section class="panel"><div class="panel-head"><div><h3>Admin actions</h3><p>Local maintenance only.</p></div></div><div class="admin-actions"><button class="secondary full" on:click={backupDatabase}>Create SQLite backup</button><button class="quiet full" on:click={seedDemoData}>Load demo data</button><p class="muted">Demo data contains no keys or security secrets.</p></div></section><section class="panel span-3"><div class="panel-head"><div><h3>Items last seen</h3><p>Latest observation by item and tag identity.</p></div></div>{#if lastSeen.length === 0}<div class="empty-row">No observations available.</div>{:else}<div class="table-wrap"><table><thead><tr><th>Item</th><th>Technology</th><th>Identifier</th><th>Chip</th><th>Total reads</th><th>Last seen</th></tr></thead><tbody>{#each lastSeen as row}<tr><td><strong>{row.name}</strong><small>{row.sku ?? ""}</small></td><td><span class="badge">{row.technology ?? "—"}</span></td><td class="mono">{row.identifier ?? "—"}</td><td>{row.chip_model ?? row.product_family ?? "—"}</td><td>{row.total_reads ?? 0}</td><td>{formatDate(row.last_seen_at)}</td></tr>{/each}</tbody></table></div>{/if}</section><section class="panel span-3"><div class="panel-head"><div><h3>Immutable security event stream</h3><p>Verification, replay, current/permanent tamper and NFC point scans.</p></div></div>{#if events.length === 0}<div class="empty-row">No security/status events yet.</div>{:else}<div class="table-wrap"><table><thead><tr><th>Time</th><th>Kind</th><th>Tag</th><th>Item</th><th>Auth</th><th>Counter</th><th>Current</th><th>Permanent</th><th>Source</th></tr></thead><tbody>{#each events as event}<tr><td>{formatDate(event.occurred_at)}</td><td>{event.event_kind}</td><td><span class="badge">{event.technology}</span><small class="mono">{event.identifier}</small></td><td>{event.item_name ?? "Unassigned"}</td><td><span class="status-pill {statusTone(event.auth_status)}">{event.auth_status}</span></td><td>{event.auth_counter ?? "—"}</td><td>{event.tamper_status}</td><td>{event.permanent_tamper_status}</td><td>{event.source}</td></tr>{/each}</tbody></table></div>{/if}</section></div>
    {/if}
  </section>
</main>
