/* eslint-disable no-console */

type Role = "ADMIN" | "STAFF" | "CLIENT";
type ProjectStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "AWAITING_APPROVAL";
type ProcurementStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
type PurchaseOrderStatus =
  | "CREATED"
  | "ORDERED"
  | "PARTIALLY_DELIVERED"
  | "DELIVERED"
  | "CANCELLED";
type InvoiceStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID" | "DRAFT" | "OVERDUE";

type LoginResult = {
  access_token: string;
  user: { id: string; email: string; role: Role };
};

type StaffProject = { id: string; name: string; status: ProjectStatus };
type ProcurementListItem = {
  id: string;
  title: string;
  projectId: string;
  status: ProcurementStatus;
  purchaseOrder?: { id: string; status: PurchaseOrderStatus } | null;
  items?: Array<{ id: string }>;
};
type InvoiceListItem = {
  id: string;
  projectId: string;
  status: InvoiceStatus;
  notes?: string | null;
  clientMarkedPaid?: boolean;
};
type ChatThread = { id: string; projectId: string; type: "MAIN" | "STAFF_ONLY" | "CUSTOM" };
type ChatMessage = { id: string; content?: string | null };

const API_BASE = process.env.DEMO_API_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.DEMO_DEFAULT_PASSWORD ?? "Password123!";
const TAG = process.env.DEMO_TAG ?? "PRIMARY";

const adminCreds = {
  email: process.env.DEMO_ADMIN_EMAIL ?? "admin@kallied.com",
  password: process.env.DEMO_ADMIN_PASSWORD ?? PASSWORD,
};
const staffCreds = {
  email: process.env.DEMO_STAFF_EMAIL ?? "staff@kallied.com",
  password: process.env.DEMO_STAFF_PASSWORD ?? PASSWORD,
};
const seedClientCreds = {
  email: process.env.DEMO_CLIENT_EMAIL ?? "client@kallied.com",
  password: process.env.DEMO_CLIENT_PASSWORD ?? PASSWORD,
};

const demoClients = [
  {
    name: `Demo Client One (${TAG})`,
    email: `demo.client.one+${TAG.toLowerCase()}@example.com`,
  },
  {
    name: `Demo Client Two (${TAG})`,
    email: `demo.client.two+${TAG.toLowerCase()}@example.com`,
  },
] as const;

const demoProjects = [
  { name: `Demo Project 1 (${TAG})`, category: "TECH" as const },
  { name: `Demo Project 2 (${TAG})`, category: "ENGINEERING" as const },
  { name: `Demo Project 3 (${TAG})`, category: "CONSULTANCY" as const },
] as const;

const procurementTitle = `Infrastructure Package (${TAG})`;
const invoiceNote = `AUTO_DEMO_${TAG}`;
const chatMarker = `AUTO_DEMO_CHAT_${TAG}`;

function logStep(step: string, detail?: string) {
  console.log(detail ? `[demo-seed] ${step}: ${detail}` : `[demo-seed] ${step}`);
}

function stripTrailingSlash(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function request(
  path: string,
  init: RequestInit = {},
  opts: { token?: string; expectJson?: boolean } = {},
) {
  const headers = new Headers(init.headers ?? {});
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);

  const res = await fetch(`${stripTrailingSlash(API_BASE)}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  }

  if (opts.expectJson === false) return null;
  if (res.status === 204) return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  return res.json();
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  return request(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { token },
  ) as Promise<T>;
}

async function patchJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  return request(
    path,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { token },
  ) as Promise<T>;
}

async function getJson<T>(path: string, token?: string): Promise<T> {
  return request(path, { method: "GET" }, { token }) as Promise<T>;
}

async function postForm<T>(path: string, form: FormData, token?: string): Promise<T> {
  return request(path, { method: "POST", body: form }, { token }) as Promise<T>;
}

async function login(email: string, password: string) {
  return postJson<LoginResult>("/auth/login", { email, password });
}

async function tryRegisterClient(email: string, name: string) {
  try {
    await postJson<{ user: { id: string } }>("/auth/register", {
      name,
      email,
      password: PASSWORD,
      companyName: "K-Allied Demo Co",
      department: "Operations",
      address: "123 Demo Street",
      phone: "+1-555-0100",
    });
    logStep("Registered client", email);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Email already in use")) {
      throw error;
    }
  }
}

async function ensureClient(email: string, name: string) {
  try {
    const existing = await login(email, PASSWORD);
    return existing;
  } catch {
    await tryRegisterClient(email, name);
    return login(email, PASSWORD);
  }
}

async function ensureProject(
  name: string,
  clientId: string,
  category: "TECH" | "ENGINEERING" | "CONSULTANCY",
  staffToken: string,
  knownProjects: StaffProject[],
) {
  const existing = knownProjects.find((p) => p.name === name);
  if (existing) return existing;

  const project = await postJson<StaffProject>(
    "/projects",
    {
      name,
      description: `Auto-generated demo project (${TAG})`,
      clientId,
      category,
      eCD: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      budget: 12000,
    },
    staffToken,
  );
  logStep("Created project", name);
  return project;
}

async function ensureProjectApproved(project: StaffProject, staffToken: string, adminToken: string) {
  if (project.status === "IN_PROGRESS" || project.status === "COMPLETED") return;
  await patchJson(`/projects/${project.id}/request-start`, {}, staffToken);
  await patchJson(`/projects/${project.id}/approve`, {}, adminToken);
  logStep("Approved project", project.name);
}

async function ensureProcurementFlow(projectId: string, staffToken: string, adminToken: string) {
  const procurements = await getJson<ProcurementListItem[]>("/admin/procurements", adminToken);
  let p = procurements.find((x) => x.projectId === projectId && x.title === procurementTitle);

  if (!p) {
    p = await postJson<ProcurementListItem>(
      "/procurement",
      {
        title: procurementTitle,
        description: `Auto demo procurement (${TAG})`,
        projectId,
      },
      staffToken,
    );
    logStep("Created procurement", p.id);
  }

  const items = await getJson<{ items: Array<{ id: string }> }>(`/procurement/${p.id}/items`, staffToken);
  if (items.items.length === 0) {
    await postJson(
      `/procurement/${p.id}/items`,
      { name: "Server Rack", quantity: 2, unit: "pcs", estimatedCost: 1800, type: "MATERIAL" },
      staffToken,
    );
    await postJson(
      `/procurement/${p.id}/items`,
      { name: "Setup Service", quantity: 1, unit: "job", estimatedCost: 1200, type: "SERVICE" },
      staffToken,
    );
    logStep("Added procurement items", p.id);
  }

  if (p.status === "DRAFT") {
    p = await patchJson<ProcurementListItem>(`/procurement/${p.id}/submit`, {}, staffToken);
    logStep("Submitted procurement", p.id);
  }
  if (p.status === "SUBMITTED") {
    p = await patchJson<ProcurementListItem>(`/procurement/${p.id}/approve`, {}, adminToken);
    logStep("Approved procurement", p.id);
  }
  if (p.status === "REJECTED") {
    throw new Error(`Procurement ${p.id} is REJECTED; resolve manually before rerun`);
  }

  let poId = p.purchaseOrder?.id;
  let poStatus = p.purchaseOrder?.status;
  if (!poId) {
    const createdPo = await postJson<{ id: string; status: PurchaseOrderStatus }>(
      `/procurement/${p.id}/purchase-order`,
      {},
      adminToken,
    );
    poId = createdPo.id;
    poStatus = createdPo.status;
    logStep("Created purchase order", poId);
  }

  if (poStatus === "CREATED") {
    const ordered = await postJson<{ status: PurchaseOrderStatus }>(
      `/procurement/purchase-order/${poId}/order`,
      {},
      adminToken,
    );
    poStatus = ordered.status;
    logStep("Marked purchase order ordered", poId);
  }
  if (poStatus === "ORDERED" || poStatus === "PARTIALLY_DELIVERED") {
    await postJson(`/procurement/purchase-order/${poId}/deliver`, {}, adminToken);
    logStep("Marked purchase order delivered", poId);
  }

  return p.id;
}

async function ensureInvoiceFlow(
  projectId: string,
  staffToken: string,
  adminToken: string,
  clientToken: string,
) {
  const invoices = await getJson<InvoiceListItem[]>("/admin/invoices", adminToken);
  let invoice = invoices.find((x) => x.projectId === projectId && x.notes === invoiceNote);

  if (!invoice) {
    invoice = await postJson<InvoiceListItem>(
      "/staff/invoices",
      {
        projectId,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        lineItems: [
          { description: "Implementation Sprint", quantity: 2, rate: 1250 },
          { description: "QA + Testing", quantity: 1, rate: 800 },
        ],
        tax: 180,
        notes: invoiceNote,
      },
      staffToken,
    );
    logStep("Created invoice", invoice.id);
  }

  if (invoice.status === "PENDING") {
    invoice = await patchJson<InvoiceListItem>(`/admin/invoices/${invoice.id}/approve`, {}, adminToken);
    logStep("Approved invoice", invoice.id);
  }

  if (!invoice.clientMarkedPaid) {
    await postJson(`/client/invoices/${invoice.id}/mark-paid`, {}, clientToken);
    logStep("Client marked invoice paid", invoice.id);
  }

  if (invoice.status !== "PAID") {
    await patchJson(`/admin/invoices/${invoice.id}/confirm-payment`, {}, adminToken);
    logStep("Confirmed invoice payment", invoice.id);
  }

  return invoice.id;
}

async function ensureChatSeed(projectId: string, staffToken: string, clientToken: string, adminToken: string) {
  const threads = await getJson<ChatThread[]>("/chat/threads", staffToken);
  const mainThread = threads.find((t) => t.projectId === projectId && t.type === "MAIN");
  if (!mainThread) throw new Error(`Main thread not found for project ${projectId}`);

  const existingMessages = await getJson<ChatMessage[]>(
    `/chat/threads/${mainThread.id}/messages`,
    staffToken,
  );
  const alreadySeeded = existingMessages.some((m) => (m.content ?? "").includes(chatMarker));
  if (alreadySeeded) return mainThread.id;

  const send = async (token: string, text: string) => {
    const form = new FormData();
    form.append("content", text);
    await postForm(`/chat/threads/${mainThread.id}/message`, form, token);
  };

  await send(staffToken, `${chatMarker} | Staff update`);
  await send(clientToken, `${chatMarker} | Client acknowledgement`);
  await postJson(`/chat/threads/adminjoin/${mainThread.id}/`, {}, adminToken);
  await send(adminToken, `${chatMarker} | Admin oversight`);
  logStep("Seeded chat messages", mainThread.id);

  return mainThread.id;
}

async function run() {
  logStep("Starting", `API=${API_BASE}, tag=${TAG}`);

  // Ensure default admin/staff/client accounts.
  await request("/auth/pip", { method: "GET" }, { expectJson: false });

  const admin = await login(adminCreds.email, adminCreds.password);
  const staff = await login(staffCreds.email, staffCreds.password);
  const seedClient = await login(seedClientCreds.email, seedClientCreds.password);
  const clientOne = await ensureClient(demoClients[0].email, demoClients[0].name);
  const clientTwo = await ensureClient(demoClients[1].email, demoClients[1].name);

  const staffProjects = await getJson<StaffProject[]>("/staff/projects", staff.access_token);
  const projectClientIds = [clientOne.user.id, clientTwo.user.id, seedClient.user.id];

  const projects: StaffProject[] = [];
  for (let i = 0; i < demoProjects.length; i += 1) {
    const spec = demoProjects[i];
    const ensured = await ensureProject(
      spec.name,
      projectClientIds[i],
      spec.category,
      staff.access_token,
      staffProjects,
    );
    projects.push(ensured);
  }

  for (const project of projects) {
    await ensureProjectApproved(project, staff.access_token, admin.access_token);
  }

  const procurementId = await ensureProcurementFlow(
    projects[0].id,
    staff.access_token,
    admin.access_token,
  );

  const invoiceId = await ensureInvoiceFlow(
    projects[1].id,
    staff.access_token,
    admin.access_token,
    clientTwo.access_token,
  );

  const chatThreadId = await ensureChatSeed(
    projects[0].id,
    staff.access_token,
    clientOne.access_token,
    admin.access_token,
  );

  logStep("Done", "Idempotent demo population complete");
  console.log(
    JSON.stringify(
      {
        apiBase: API_BASE,
        tag: TAG,
        users: {
          admin: admin.user.email,
          staff: staff.user.email,
          clientSeed: seedClient.user.email,
          clientOne: clientOne.user.email,
          clientTwo: clientTwo.user.email,
        },
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
        procurementId,
        invoiceId,
        chatThreadId,
      },
      null,
      2,
    ),
  );
}

run().catch((err) => {
  console.error("[demo-seed] failed");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
