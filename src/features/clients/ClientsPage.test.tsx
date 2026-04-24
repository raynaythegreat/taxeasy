import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../lib/i18n";
import { SidebarProvider } from "../../lib/sidebar";
import { ClientsPage } from "./ClientsPage";

const progressListeners = vi.hoisted(() => new Set<(event: { payload: unknown }) => void>());

const tauriMocks = vi.hoisted(() => ({
  bulkImportClientFolders: vi.fn(),
  createClient: vi.fn(),
  getActiveClientId: vi.fn(),
  listClients: vi.fn(),
  onClientImportProgress: vi.fn(),
  pickClientFolder: vi.fn(),
  pickClientFolders: vi.fn(),
  resyncClientFolder: vi.fn(),
  setActiveClientPref: vi.fn(),
  switchClient: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_eventName: string, callback: (event: { payload: unknown }) => void) => {
    progressListeners.add(callback);
    return () => {
      progressListeners.delete(callback);
    };
  }),
}));

vi.mock("../../components/ClientWorkspace", () => ({
  ClientWorkspace: () => <div>Client workspace</div>,
}));

vi.mock("../../lib/tauri", async () => {
  const actual = await vi.importActual<typeof import("../../lib/tauri")>("../../lib/tauri");
  return {
    ...actual,
    bulkImportClientFolders: tauriMocks.bulkImportClientFolders,
    createClient: tauriMocks.createClient,
    getActiveClientId: tauriMocks.getActiveClientId,
    listClients: tauriMocks.listClients,
    onClientImportProgress: tauriMocks.onClientImportProgress,
    pickClientFolder: tauriMocks.pickClientFolder,
    pickClientFolders: tauriMocks.pickClientFolders,
    resyncClientFolder: tauriMocks.resyncClientFolder,
    setActiveClientPref: tauriMocks.setActiveClientPref,
    switchClient: tauriMocks.switchClient,
  };
});

function emitProgress(payload: unknown) {
  for (const listener of progressListeners) {
    listener({ payload });
  }
}

function renderClientsPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <SidebarProvider>
          <ClientsPage onBack={() => {}} />
        </SidebarProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe("ClientsPage import folders", () => {
  beforeEach(() => {
    localStorage.clear();
    progressListeners.clear();
    vi.clearAllMocks();
    tauriMocks.listClients.mockResolvedValue([]);
    tauriMocks.getActiveClientId.mockResolvedValue(null);
    tauriMocks.switchClient.mockResolvedValue(undefined);
    tauriMocks.setActiveClientPref.mockResolvedValue(undefined);
    tauriMocks.createClient.mockResolvedValue(undefined);
    tauriMocks.onClientImportProgress.mockImplementation(async (callback) => {
      progressListeners.add(({ payload }) => callback(payload));
      return () => {
        progressListeners.clear();
      };
    });
    tauriMocks.pickClientFolder.mockResolvedValue(null);
  });

  it("does nothing when the folder picker is canceled", async () => {
    tauriMocks.pickClientFolders.mockResolvedValue(null);

    renderClientsPage();

    fireEvent.click(await screen.findByRole("button", { name: "Import Folders" }));

    await waitFor(() => {
      expect(tauriMocks.pickClientFolders).toHaveBeenCalledTimes(1);
    });
    expect(tauriMocks.bulkImportClientFolders).not.toHaveBeenCalled();
    expect(screen.queryByText("Folder import complete")).not.toBeInTheDocument();
  });

  it("shows live progress and a richer import summary", async () => {
    let resolveImport:
      | ((value: {
          created: Array<{
            client: { id: string; name: string };
            importedDocumentCount: number;
            dedupedDocumentCount?: number;
            skippedDocumentCount?: number;
          }>;
          skipped: Array<{ clientName: string; folderPath: string; reason: string }>;
          failed: Array<{ clientName?: string; folderPath: string; reason: string }>;
          importedDocumentCount?: number;
          skippedDocumentCount?: number;
          dedupedDocumentCount?: number;
        }) => void)
      | undefined;

    tauriMocks.pickClientFolders.mockResolvedValue(["/clients/a", "/clients/b"]);
    tauriMocks.bulkImportClientFolders.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        }),
    );

    renderClientsPage();

    fireEvent.click(await screen.findByRole("button", { name: "Import Folders" }));

    await waitFor(() => {
      expect(screen.getByText("Importing folders")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(progressListeners.size).toBeGreaterThan(0);
    });

    await act(async () => {
      emitProgress({
        operation: "bulk_import",
        current: 1,
        total: 2,
        clientName: "Alice Example",
        importedCount: 3,
        dedupedCount: 1,
        message: "Working on Alice Example",
      });
    });

    expect(screen.getByText("Working on Alice Example")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("3 imported")).toBeInTheDocument();
    expect(screen.getByText("1 deduped")).toBeInTheDocument();

    resolveImport?.({
      created: [
        {
          client: { id: "c-1", name: "Alice Example" },
          importedDocumentCount: 4,
          dedupedDocumentCount: 1,
          skippedDocumentCount: 2,
        },
        {
          client: { id: "c-2", name: "Bob Example" },
          importedDocumentCount: 5,
        },
      ],
      skipped: [
        {
          clientName: "Existing Client",
          folderPath: "/clients/c",
          reason: "duplicate active client name",
        },
      ],
      failed: [],
      importedDocumentCount: 9,
      skippedDocumentCount: 2,
      dedupedDocumentCount: 1,
    });

    await waitFor(() => {
      expect(screen.getByText("Folder import complete")).toBeInTheDocument();
    });

    expect(tauriMocks.bulkImportClientFolders).toHaveBeenCalledWith(["/clients/a", "/clients/b"]);
    expect(
      screen.getByText(
        "2 created, 1 skipped, 0 failed, 9 documents imported, 1 deduped, 2 document skips",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Created clients")).toBeInTheDocument();
    expect(screen.getByText("Skipped folders")).toBeInTheDocument();

    await waitFor(() => {
      expect(tauriMocks.listClients).toHaveBeenCalledTimes(2);
    });
  });

  it("re-syncs a client using the saved source folder path", async () => {
    tauriMocks.listClients.mockResolvedValue([
      {
        id: "client-1",
        name: "Alice Example",
        entity_type: "i1040",
        source_folder_path: "/clients/alice",
        fiscal_year_start_month: 1,
        accounting_method: "cash",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    tauriMocks.resyncClientFolder.mockResolvedValue({
      clientId: "client-1",
      clientName: "Alice Example",
      sourceFolderPath: "/clients/alice",
      importedDocumentCount: 3,
      dedupedDocumentCount: 2,
      skippedDocumentCount: 1,
      failedDocumentCount: 0,
    });

    renderClientsPage();

    fireEvent.click(await screen.findByTitle("Re-sync Folder"));

    await waitFor(() => {
      expect(tauriMocks.resyncClientFolder).toHaveBeenCalledWith("client-1");
    });

    await waitFor(() => {
      expect(screen.getByText("Folder re-sync complete")).toBeInTheDocument();
    });

    expect(
      screen.getByText("3 imported, 2 deduped, 1 document skips, 0 failed"),
    ).toBeInTheDocument();
    expect(screen.getByText("/clients/alice")).toBeInTheDocument();
  });
});
