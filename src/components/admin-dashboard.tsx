"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Button, Flex, Grid, Heading, Image, Input, Link, NativeSelect, Text, Textarea, chakra } from "@chakra-ui/react";
import { documentSchema, formatMoney, imageUrl, mirrorAll, pricePence, type DeviceStatus, type MenuDocument, type MenuItem, type SavedDocument, type Screen } from "@/lib/model";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <Box as="label" display="block"><Text fontSize="sm" fontWeight="bold" mb="1.5">{label}</Text>{children}</Box>;
}
function Select({ value, onChange, children, label }: { value: string; onChange: (value: string) => void; children: ReactNode; label: string }) {
  return <Field label={label}><NativeSelect.Root><NativeSelect.Field value={value} onChange={event => onChange(event.target.value)} bg="white">{children}</NativeSelect.Field></NativeSelect.Root></Field>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <Flex as="label" align="center" gap="2" minH="11" cursor="pointer"><chakra.input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} w="5" h="5" accentColor="ink" /><Text fontSize="sm">{label}</Text></Flex>;
}
function PriceInput({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  const [text, setText] = useState((value / 100).toFixed(2));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText((value / 100).toFixed(2)); }, [value]);
  return <Field label={label}><Input type="text" inputMode="decimal" required pattern="[0-9]{1,4}(\.[0-9]{1,2})?" value={text} onFocus={() => { focused.current = true; }} onChange={event => {
    const next = event.target.value; setText(next); const pence = pricePence(next);
    event.target.setCustomValidity(pence === null ? "Enter a price between £0 and £1,000, with up to two decimal places." : "");
    if (pence !== null) onChange(pence);
  }} onBlur={event => { focused.current = false; const pence = pricePence(event.target.value); if (pence !== null) setText((pence / 100).toFixed(2)); }} bg="white" /></Field>;
}
class ApiError extends Error { constructor(public readonly status: number, message: string) { super(message); } }
function useApi() {
  const requests = useRef(new Set<AbortController>());
  useEffect(() => { const active = requests.current; return () => { active.forEach(request => request.abort()); active.clear(); }; }, []);
  return useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const controller = new AbortController(); requests.current.add(controller);
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`/api/signage/${path}`, { ...init, credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new ApiError(response.status, result.error ?? "The request failed.");
      return result as T;
    } finally { clearTimeout(timeout); requests.current.delete(controller); }
  }, []);
}
const payload = (method: string, value: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
const post: RequestInit = { method: "POST" };
export function AdminDashboard() {
  const api = useApi();
  const [auth, setAuth] = useState<"loading" | "in" | "out" | "unavailable">("loading");
  const [saved, setSaved] = useState<SavedDocument | null>(null);
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [dirty, setDirty] = useState(false); const dirtyRef = useRef(false);
  const [busy, setBusy] = useState(false); const [uploads, setUploads] = useState(0);
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [tab, setTab] = useState<"screens" | "menu">("screens");
  const [password, setPassword] = useState("");
  const [filter, setFilter] = useState(""); const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [codes, setCodes] = useState<Record<number, { value: string; expiresAt: number }>>({});
  const [now, setNow] = useState(0);
  const report = useCallback((failure: unknown) => {
    if (failure instanceof DOMException && failure.name === "AbortError") { setError("The request timed out or was cancelled. Your unsaved changes are still here."); return; }
    setError(failure instanceof Error ? failure.message : "Something went wrong. Please try again.");
    if (failure instanceof ApiError && failure.status === 401) setAuth("out");
  }, []);
  const load = useCallback(async (replace = false) => {
    const result = await api<SavedDocument & { devices: DeviceStatus[] }>("admin");
    const document = documentSchema.parse(result.document);
    if (replace || !dirtyRef.current) { setSaved({ document, revision: result.revision }); setDirty(false); dirtyRef.current = false; }
    setDevices(result.devices); setAuth("in"); setError("");
  }, [api]);
  useEffect(() => {
    let active = true;
    void load().catch(failure => { if (!active) return;
      if (failure instanceof ApiError && failure.status === 401) setAuth("out");
      else { setAuth("unavailable"); report(failure); }
    });
    return () => { active = false; };
  }, [load, report]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); setNow(Date.now()); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (auth !== "in") return;
    let active = true, running = false;
    const timer = setInterval(async () => {
      if (running) return; running = true;
      try { const result = await api<{ devices: DeviceStatus[] }>("admin/devices"); if (active) setDevices(result.devices); }
      catch (failure) { if (active) report(failure); } finally { running = false; }
    }, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [api, auth, report]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", leave); return () => window.removeEventListener("beforeunload", leave);
  }, []);
  const change = (transform: (document: MenuDocument) => MenuDocument) => {
    setSaved(value => value ? { ...value, document: transform(value.document) } : value);
    setDirty(true); dirtyRef.current = true; setMessage("");
  };
  const screenChange = (id: number, patch: Partial<Screen>) => change(doc => ({ ...doc, screens: doc.screens.map(screen => screen.id === id ? { ...screen, ...patch } : screen) }));
  const itemChange = (id: string, patch: Partial<MenuItem>) => change(doc => ({ ...doc, items: doc.items.map(item => item.id === id ? { ...item, ...patch } : item) }));
  async function upload(file: File | undefined, apply: (id: string) => void) {
    if (!file) return; setError("");
    if (file.size > 3 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Use JPG, PNG or WebP, up to 3 MB."); return; }
    setUploads(count => count + 1);
    try { const result = await api<{ id: string }>("admin/images", { method: "POST", headers: { "Content-Type": file.type }, body: file }); apply(result.id); }
    catch (failure) { report(failure); } finally { setUploads(count => count - 1); }
  }
  async function save() {
    if (!saved) return; setBusy(true); setError(""); setMessage("");
    try {
      const document = documentSchema.parse(saved.document);
      const result = await api<SavedDocument>("admin", payload("PUT", { expectedRevision: saved.revision, document }));
      setSaved(result); setDirty(false); dirtyRef.current = false;
      setMessage(`Version ${result.revision} saved. Connected screens check for updates every 10 seconds.`);
    } catch (failure) { report(failure); } finally { setBusy(false); }
  }
  if (auth === "loading") return <Box as="main" p="8"><Text role="status">Loading screen management...</Text></Box>;
  if (auth !== "in" || !saved) return <Flex as="main" minH="100vh" align="center" justify="center" p="5"><Box bg="white" borderRadius="2xl" p={{ base: "6", md: "10" }} maxW="480px" w="full" border="1px solid" borderColor="gray.200">
    <Text color="muted" fontWeight="bold" mb="3">SCREEN MANAGEMENT</Text><Heading size="2xl">Your menu. Every screen.</Heading>
    <Text my="5">Sign in to manage the six displays, prices, images and promotions.</Text>
    {auth === "unavailable" ? <><Text role="alert" mb="4">{error || "Server setup is incomplete."}</Text><Text fontSize="sm" mb="4">Follow the server setup section in the repository README. No default login is enabled.</Text><Button onClick={() => void load().catch(report)}>Retry connection</Button></> : <Box as="form" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try { await api("login", payload("POST", { password })); setPassword(""); await load(); }
      catch (failure) { report(failure); } finally { setBusy(false); }
    }}><Field label="Administrator password"><Input type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={14} maxLength={256} autoComplete="current-password" required /></Field>
      <Button type="submit" loading={busy} w="full" mt="4" bg="ink" color="paper">Sign in</Button>{error && <Text role="alert" color="red.700" mt="4">{error}</Text>}</Box>}
  </Box></Flex>;
  const doc = saved.document;
  const shownItems = doc.items.filter(item => (!category || item.categoryId === category) && `${item.name} ${item.description}`.toLowerCase().includes(filter.toLowerCase()));
  const updateCategories = (id: number, categoryId: string, checked: boolean) => screenChange(id, { categoryIds: checked
    ? [...(doc.screens.find(screen => screen.id === id)?.categoryIds ?? []), categoryId]
    : (doc.screens.find(screen => screen.id === id)?.categoryIds ?? []).filter(value => value !== categoryId) });
  return <Box as="main" maxW="1500px" mx="auto" px={{ base: "4", md: "8" }} pb="12">
    <Flex justify="space-between" gap="4" align="center" py="6" wrap="wrap"><Box><Text fontSize="sm" color="muted" fontWeight="bold">KITCHEN CONTROL</Text><Heading size="2xl">Screen management</Heading></Box>
      <Flex gap="2" wrap="wrap"><Link href="/" px="3" py="2">View public menu</Link><Button variant="outline" onClick={async () => {
        if (dirty && !window.confirm("Sign out with unsaved changes? The changes will remain here until this page is closed.")) return;
        try { await api("logout", post); setAuth("out"); } catch (failure) { report(failure); }
      }}>Sign out</Button></Flex></Flex>
    <Flex bg="ink" color="paper" p="5" borderRadius="xl" justify="space-between" gap="4" wrap="wrap" mb="5"><Box><Text fontWeight="bold">One menu. Six displays.</Text><Text fontSize="sm">{doc.items.length} items · {doc.items.filter(item => item.status === "draft").length} drafts · Saved version {saved.revision}</Text></Box><Text fontSize="sm">Changes appear after you save. Imported prices need approval.</Text></Flex>
    <Flex gap="2" mb="5"><Button variant={tab === "screens" ? "solid" : "outline"} onClick={() => setTab("screens")}>Screens</Button><Button variant={tab === "menu" ? "solid" : "outline"} onClick={() => setTab("menu")}>Menu & prices</Button></Flex>
    {error && <Box role="alert" bg="red.50" color="red.800" p="4" mb="4" borderRadius="lg">{error}</Box>}
    {message && <Box role="status" bg="green.50" color="green.800" p="4" mb="4" borderRadius="lg">{message}</Box>}
    <Box as="form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <Flex position="sticky" top="0" zIndex="5" bg="paper" py="3" gap="3" align="center" mb="4" wrap="wrap" borderBottom="1px solid" borderColor="gray.200">
        <Button type="submit" bg="ink" color="paper" loading={busy} disabled={!dirty || uploads > 0}>Save changes</Button>
        <Button type="button" variant="outline" disabled={busy || uploads > 0} onClick={async () => {
          if (dirty && !window.confirm("Discard unsaved changes and reload the saved version?")) return;
          try { await load(true); setMessage("Saved version reloaded."); } catch (failure) { report(failure); }
        }}>Reload saved</Button><Text fontSize="sm" color="muted">{uploads ? "Uploading image..." : dirty ? "Unsaved changes" : "All changes saved"}</Text>
      </Flex>
      <chakra.fieldset disabled={busy || uploads > 0} border="0" p="0" minW="0">
      {tab === "screens" ? <Grid templateColumns={{ base: "1fr", lg: "repeat(2, minmax(0, 1fr))" }} gap="5">
        {doc.screens.map(screen => {
          const device = devices.find(value => value.screenId === screen.id);
          const lastSeen = device?.lastSeen ? Date.parse(device.lastSeen) : 0;
          const online = lastSeen > 0 && now - lastSeen >= 0 && now - lastSeen < 90_000;
          const pairingCode = codes[screen.id];
          return <Box key={screen.id} p={{ base: "4", md: "6" }} bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl">
            <Flex justify="space-between" align="start" gap="3" mb="4"><Box><Heading size="lg">Screen {screen.id}</Heading><Text fontSize="sm" color="muted">{online ? "Connected" : device?.paired ? "Not recently seen" : "Not paired"}{device?.reportedRevision ? ` · Version ${device.reportedRevision}` : ""}</Text></Box><Link href={`/display/${screen.id}`} target="_blank" rel="noopener noreferrer" textDecoration="underline">Open display</Link></Flex>
            <Flex gap="2" wrap="wrap" mb="3"><Button size="sm" variant="outline" type="button" onClick={async () => {
              try { const result = await api<{ code: string; expiresInSeconds: number }>(`admin/screens/${screen.id}/pair`, post);
                setCodes(current => ({ ...current, [screen.id]: { value: result.code, expiresAt: Date.now() + result.expiresInSeconds * 1000 } })); setError("");
              } catch (failure) { report(failure); }
            }}>Generate pairing code</Button><Button size="sm" variant="ghost" type="button" onClick={async () => {
              if (!window.confirm(`Disconnect Screen ${screen.id}? It will need a new pairing code.`)) return;
              try { await api(`admin/screens/${screen.id}/revoke`, post); setCodes(current => { const next = { ...current }; delete next[screen.id]; return next; });
                const result = await api<{ devices: DeviceStatus[] }>("admin/devices"); setDevices(result.devices); setMessage(`Screen ${screen.id} disconnected. Offline copies expire within 15 minutes.`);
              } catch (failure) { report(failure); }
            }}>Disconnect</Button></Flex>
            {pairingCode && <Text bg="orange.50" p="3" mb="3" role="status">{now < pairingCode.expiresAt ? `Code: ${pairingCode.value} · ${Math.ceil((pairingCode.expiresAt - now) / 60000)} min remaining` : "Pairing code expired. Generate another code."}</Text>}
            <Grid gap="4"><Field label={`Screen ${screen.id} name`}><Input value={screen.name} required maxLength={60} onChange={event => screenChange(screen.id, { name: event.target.value })} /></Field>
              <Toggle label={`Enable screen ${screen.id}`} checked={screen.enabled} onChange={enabled => screenChange(screen.id, { enabled })} />
              <Select label={`Screen ${screen.id} content source`} value={screen.mirrorOf?.toString() ?? ""} onChange={value => screenChange(screen.id, { mirrorOf: value ? Number(value) : null })}>
                <option value="">Own content</option>{doc.screens.filter(value => value.id !== screen.id).map(value => <option key={value.id} value={value.id}>Mirror screen {value.id}</option>)}
              </Select>
              {screen.mirrorOf === null ? <>
                <Field label={`Screen ${screen.id} heading`}><Input value={screen.title} required maxLength={100} onChange={event => screenChange(screen.id, { title: event.target.value })} /></Field>
                <Grid templateColumns="1fr 1fr" gap="3"><Select label={`Screen ${screen.id} layout`} value={screen.layout} onChange={layout => screenChange(screen.id, { layout: layout as Screen["layout"] })}><option value="menu">Menu board</option><option value="poster">Image / offer poster</option></Select>
                  <Select label={`Screen ${screen.id} orientation`} value={screen.orientation} onChange={orientation => screenChange(screen.id, { orientation: orientation as Screen["orientation"] })}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></Select></Grid>
                {screen.layout === "menu" ? <>
                  <chakra.details><chakra.summary cursor="pointer" fontWeight="bold">Categories ({screen.categoryIds.length || "all"})</chakra.summary><Text fontSize="sm" color="muted">No selection means all categories.</Text>
                    <Grid templateColumns="repeat(2, minmax(0, 1fr))">{doc.categories.map(value => <Toggle key={value.id} label={value.name} checked={screen.categoryIds.includes(value.id)} onChange={checked => updateCategories(screen.id, value.id, checked)} />)}</Grid></chakra.details>
                  <Grid templateColumns="1fr 1fr" gap="3"><Field label={`Screen ${screen.id} rows per page`}><Input type="number" min={2} max={12} required value={screen.itemsPerPage} onChange={event => screenChange(screen.id, { itemsPerPage: Number(event.target.value) })} /></Field>
                    <Field label={`Screen ${screen.id} seconds per page`}><Input type="number" min={8} max={60} required value={screen.rotationSeconds} onChange={event => screenChange(screen.id, { rotationSeconds: Number(event.target.value) })} /></Field></Grid>
                </> : <Field label={`Screen ${screen.id} poster image`}><Input type="file" accept="image/jpeg,image/png,image/webp" pt="1" onChange={event => void upload(event.target.files?.[0], imageId => screenChange(screen.id, { imageId }))} />
                  {screen.imageId && <Image key={screen.imageId} src={imageUrl(screen.imageId)} alt={screen.title} maxH="180px" mt="3" objectFit="contain" />}</Field>}
                <Field label={`Screen ${screen.id} promotion text`}><Textarea value={screen.promotion} maxLength={160} onChange={event => screenChange(screen.id, { promotion: event.target.value })} /></Field>
                <Field label={`Screen ${screen.id} promotion expiry (UTC)`}><Input type="datetime-local" required={Boolean(screen.promotion)} value={screen.promotionEndsAt?.slice(0, 16) ?? ""} onChange={event => screenChange(screen.id, { promotionEndsAt: event.target.value ? new Date(`${event.target.value}:00Z`).toISOString() : null })} /></Field>
                <Button type="button" variant="outline" onClick={() => { try { const next = mirrorAll(doc, screen.id); change(() => next); } catch (failure) { report(failure); } }}>Show this content on all six screens</Button>
              </> : <Text fontSize="sm">Content, orientation and timing follow the source. Each screen retains its own enable switch. A paused source also pauses its mirrors.</Text>}
            </Grid>
          </Box>;
        })}
      </Grid> : <>
        <Grid templateColumns={{ base: "1fr", md: "2fr 1fr" }} gap="4" mb="4"><Field label="Search menu"><Input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Search items" /></Field><Select label="Filter category" value={category} onChange={setCategory}><option value="">All categories</option>{doc.categories.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</Select></Grid>
        <Flex gap="3" mb="5" wrap="wrap" align="end"><Box flex="1" minW="180px"><Field label="New category"><Input maxLength={80} value={newCategory} onChange={event => setNewCategory(event.target.value)} /></Field></Box>
          <Button type="button" variant="outline" disabled={!newCategory.trim()} onClick={() => { change(document => ({ ...document, categories: [...document.categories, { id: crypto.randomUUID(), name: newCategory.trim() }] })); setNewCategory(""); }}>Add category</Button>
          <Button type="button" disabled={!doc.categories.length} onClick={() => { const id = crypto.randomUUID(); const categoryId = category || doc.categories[0]?.id; if (!categoryId) return;
            change(document => ({ ...document, items: [{ id, categoryId, name: "New item", description: "", status: "draft", available: true, imageId: null, variants: [{ id: crypto.randomUUID(), label: "Standard", pricePence: 0 }] }, ...document.items] })); setFilter("");
          }}>Add menu item</Button></Flex>
        <Text fontSize="sm" color="muted" mb="4">Prices are GBP. Approve each item by marking it Published. Unavailable items are hidden everywhere. Every size is displayed with its own price.</Text>
        {!shownItems.length && <Box bg="white" p="8" borderRadius="xl"><Text>No items match these filters.</Text></Box>}
        <Grid templateColumns={{ base: "1fr", xl: "repeat(2, minmax(0, 1fr))" }} gap="5">
          {shownItems.map(item => <Box key={item.id} bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" p="5">
            <Flex justify="space-between" gap="3" mb="4"><Heading size="md">{item.name}</Heading><Text fontSize="sm" color="muted">{item.status === "draft" ? "Draft" : "Published"}</Text></Flex>
            <Grid gap="4"><Field label={`Name: ${item.name}`}><Input required value={item.name} maxLength={120} onChange={event => itemChange(item.id, { name: event.target.value })} /></Field>
              <Select label={`Category: ${item.name}`} value={item.categoryId} onChange={categoryId => itemChange(item.id, { categoryId })}>{doc.categories.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</Select>
              <Field label={`Description: ${item.name}`}><Textarea value={item.description} maxLength={300} onChange={event => itemChange(item.id, { description: event.target.value })} /></Field>
              <Flex gap="5" wrap="wrap"><Toggle label={`Published: ${item.name}`} checked={item.status === "published"} onChange={checked => itemChange(item.id, { status: checked ? "published" : "draft" })} /><Toggle label={`Available: ${item.name}`} checked={item.available} onChange={available => itemChange(item.id, { available })} /></Flex>
              {item.variants.map(variant => <Grid key={variant.id} templateColumns="minmax(0, 1fr) minmax(100px, .6fr) auto" gap="2" alignItems="end">
                <Field label={`Option: ${item.name}`}><Input required value={variant.label} maxLength={80} onChange={event => itemChange(item.id, { variants: item.variants.map(value => value.id === variant.id ? { ...value, label: event.target.value } : value) })} /></Field>
                <PriceInput label={`Price: ${item.name} ${variant.label}`} value={variant.pricePence} onChange={pricePence => itemChange(item.id, { variants: item.variants.map(value => value.id === variant.id ? { ...value, pricePence } : value) })} />
                <Button type="button" size="sm" variant="ghost" aria-label={`Remove option ${variant.label} from ${item.name}`} disabled={item.variants.length === 1} onClick={() => itemChange(item.id, { variants: item.variants.filter(value => value.id !== variant.id) })}>Remove</Button>
              </Grid>)}
              <Button type="button" variant="outline" size="sm" disabled={item.variants.length >= 30} onClick={() => itemChange(item.id, { variants: [...item.variants, { id: crypto.randomUUID(), label: "New option", pricePence: 0 }] })}>Add size / option</Button>
              <Field label={`Photo: ${item.name}`}><Input type="file" accept="image/jpeg,image/png,image/webp" pt="1" onChange={event => void upload(event.target.files?.[0], imageId => itemChange(item.id, { imageId }))} /></Field>
              {item.imageId && <Flex gap="3" align="center"><Image key={item.imageId} src={imageUrl(item.imageId)} alt={item.name} w="24" h="24" objectFit="cover" borderRadius="lg" /><Button type="button" variant="ghost" onClick={() => itemChange(item.id, { imageId: null })}>Remove photo</Button></Flex>}
              <Text fontSize="sm" color="muted">{item.variants.map(value => `${value.label}: ${formatMoney(value.pricePence)}`).join(" · ")}</Text>
            </Grid>
          </Box>)}
        </Grid>
      </>}
      </chakra.fieldset>
    </Box>
    <Box borderTop="1px solid" borderColor="gray.200" mt="8" pt="5"><Text fontSize="sm" color="muted">Pair each TV at /display/1 to /display/6. Keep-awake and full screen depend on the TV browser. Disable sleep, eco timers and screen savers in each television's own settings. Images uploaded here are public menu assets.</Text></Box>
  </Box>;
}
