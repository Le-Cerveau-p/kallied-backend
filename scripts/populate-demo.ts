/* eslint-disable no-console */

type LoginResult = {
  access_token: string;
  user: { id: string; email: string; role: "ADMIN" | "STAFF" | "CLIENT" };
};

type Project = { id: string; name: string; clientId: string; status: string };
type Procurement = { id: string; title: string; status: string };
type PurchaseOrder = { id: string; requestId: string };
type Invoice = { id: string; invoiceNumber: string; status: string; projectId: string };
type ChatThread = { id: string; projectId: string; type: "MAIN" | "STAFF_ONLY" | "CUSTOM" };

const API_BASE = process.env.DEMO_API_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.DEMO_DEFAULT_PASSWORD ?? "Password123!";
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

const adminCreds = {
  email: process.env.DEMO_ADMIN_EMAIL ?? "admin@kallied.com",
  password: process.env.DEMO_ADMIN_PASSWORD ?? PASSWORD,
};
const staffCreds = {
  email: process.env.DEMO_STAFF_EMAIL ?? "staff@kallied.com",
  password: process.env.DEMO_STAFF_PASSWORD ?? PASSWORD,
};
const clientCreds = {
  email: process.env.DEMO_CLIENT_EMAIL ?? "client@kallied.com",
  password: process.env.DEMO_CLIENT_PASSWORD ?? PASSWORD,
};

const categories = ["TECH", "ENGINEERING", "CONSULTANCY"] as const;

function logStep(step: string, detail?: string) {
  console.log(detail ? `[demo-seed] ${step}: ${detail}` : `[demo-seed] ${step}`);
}

async function request(
  path: string,
  init: RequestInit = {},
  opts: { token?: string; expectJson?: boolean } = {},
) {
  const headers = new Headers(init.headers ?? {});
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);

  const res = await fetch(`${API_BASE}${path}`, {
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

async function postForm<T>(
  path: string,
  form: FormData,
  token?: string,
): Promise<T> {
  return request(
    path,
    {
      method: "POST",
      body: form,
    },
    { token },
  ) as Promise<T>;
}

async function login(email: string, password: string) {
  return postJson<LoginResult>("/auth/login", { email, password });
}

async function registerClient(email: string, name: string) {
  return postJson<{ user: { id: string; email: string; role: string } }>(
    "/auth/register",
    {
      name,
      email,
      password: PASSWORD,
      companyName: "K-Allied Demo Co",
      department: "Operations",
      address: "123 Demo Street",
      phone: "+1-555-0100",
    },
  );
}

async function sendChatText(threadId: string, text: string, token: string) {
  const form = new FormData();
  form.append("content", text);
  return postForm(`/chat/threads/${threadId}/message`, form, token);
}

async function run() {
  logStep("Starting", `API=${API_BASE}, run=${RUN_ID}`);

  // Ensure baseline users exist (admin/staff/client default credentials).
  await request("/auth/pip", { method: "GET" }, { expectJson: false });
  logStep("Seeded defaults", "admin/staff/client defaults are available");

  // Register two fresh clients for demo data.
  const demoClients = [
    {
      name: `Demo Client One ${RUN_ID}`,
      email: `demo.client.one.${RUN_ID}@example.com`,
    },
    {
      name: `Demo Client Two ${RUN_ID}`,
      email: `demo.client.two.${RUN_ID}@example.com`,
    },
  ];

  const registeredClientIds: string[] = [];
  for (const c of demoClients) {
    const registered = await registerClient(c.email, c.name);
    registeredClientIds.push(registered.user.id);
    logStep("Registered client", `${registered.user.email}`);
  }

  // Logins
  const admin = await login(adminCreds.email, adminCreds.password);
  const staff = await login(staffCreds.email, staffCreds.password);
  const seedClient = await login(clientCreds.email, clientCreds.password);
  const newClientOne = await login(demoClients[0].email, PASSWORD);
  logStep(
    "Logged in",
    `admin=${admin.user.email}, staff=${staff.user.email}, client=${seedClient.user.email}`,
  );

  // Create a few projects as staff.
  const projectClientIds = [registeredClientIds[0], registeredClientIds[1], seedClient.user.id];
  const createdProjects: Project[] = [];
  for (let i = 0; i < 3; i += 1) {
    const body = {
      name: `Demo Project ${i + 1} (${RUN_ID})`,
      description: `Auto-generated demo project ${i + 1}`,
      clientId: projectClientIds[i],
      category: categories[i % categories.length],
      eCD: new Date(Date.now() + (20 + i * 10) * 24 * 60 * 60 * 1000).toISOString(),
      budget: 5000 + i * 3500,
    };
    const project = await postJson<Project>("/projects", body, staff.access_token);
    createdProjects.push(project);
    logStep("Created project", project.name);
  }

  // Staff requests start; admin approves all projects.
  for (const project of createdProjects) {
    await patchJson(`/projects/${project.id}/request-start`, {}, staff.access_token);
    await patchJson(`/projects/${project.id}/approve`, {}, admin.access_token);
    logStep("Approved project", project.name);
  }

  // Procurement flow on first project.
  const procurement = await postJson<Procurement>(
    "/procurement",
    {
      title: `Infrastructure Package (${RUN_ID})`,
      description: "Demo procurement request",
      projectId: createdProjects[0].id,
      cost: 0,
    },
    staff.access_token,
  );
  logStep("Created procurement", procurement.id);

  await postJson(
    `/procurement/${procurement.id}/items`,
    { name: "Server Rack", quantity: 2, unit: "pcs", estimatedCost: 1800, type: "MATERIAL" },
    staff.access_token,
  );
  await postJson(
    `/procurement/${procurement.id}/items`,
    { name: "Setup Service", quantity: 1, unit: "job", estimatedCost: 1200, type: "SERVICE" },
    staff.access_token,
  );
  await patchJson(`/procurement/${procurement.id}/submit`, {}, staff.access_token);
  await patchJson(`/procurement/${procurement.id}/approve`, {}, admin.access_token);
  logStep("Approved procurement", procurement.id);

  const po = await postJson<PurchaseOrder>(
    `/procurement/${procurement.id}/purchase-order`,
    {},
    admin.access_token,
  );
  await postJson(`/procurement/purchase-order/${po.id}/order`, {}, admin.access_token);
  await postJson(`/procurement/purchase-order/${po.id}/deliver`, {}, admin.access_token);
  logStep("Purchase order lifecycle completed", po.id);

  // Invoice lifecycle on second project.
  const invoice = await postJson<Invoice>(
    "/staff/invoices",
    {
      projectId: createdProjects[1].id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      lineItems: [
        { description: "Implementation Sprint", quantity: 2, rate: 1250 },
        { description: "QA + Testing", quantity: 1, rate: 800 },
      ],
      tax: 180,
      notes: "Auto-generated demo invoice",
    },
    staff.access_token,
  );
  logStep("Created invoice", invoice.invoiceNumber);

  await patchJson(`/admin/invoices/${invoice.id}/approve`, {}, admin.access_token);
  logStep("Approved invoice", invoice.invoiceNumber);

  // Project 2 belongs to registered client #2; log them in and mark paid.
  const project2Client = await login(demoClients[1].email, PASSWORD);
  await postJson(`/client/invoices/${invoice.id}/mark-paid`, {}, project2Client.access_token);
  await patchJson(`/admin/invoices/${invoice.id}/confirm-payment`, {}, admin.access_token);
  logStep("Payment confirmed", invoice.invoiceNumber);

  // Chat messages in project #1 main thread from all roles.
  const staffThreads = await getJson<ChatThread[]>("/chat/threads", staff.access_token);
  const mainThread = staffThreads.find(
    (t) => t.projectId === createdProjects[0].id && t.type === "MAIN",
  );
  if (!mainThread) {
    throw new Error("Main chat thread not found for first project");
  }

  await sendChatText(
    mainThread.id,
    `Staff update for ${createdProjects[0].name} (${RUN_ID})`,
    staff.access_token,
  );
  await sendChatText(
    mainThread.id,
    `Client acknowledgement for ${createdProjects[0].name} (${RUN_ID})`,
    newClientOne.access_token,
  );
  await postJson(`/chat/threads/adminjoin/${mainThread.id}/`, {}, admin.access_token);
  await sendChatText(
    mainThread.id,
    `Admin oversight note for ${createdProjects[0].name} (${RUN_ID})`,
    admin.access_token,
  );
  logStep("Chat seeded", mainThread.id);

  logStep("Done", "Demo data successfully populated");
  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        clients: [seedClient.user.email, ...demoClients.map((c) => c.email)],
        projects: createdProjects.map((p) => ({ id: p.id, name: p.name })),
        procurementId: procurement.id,
        purchaseOrderId: po.id,
        invoiceId: invoice.id,
        chatThreadId: mainThread.id,
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
