import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  type CreateMileagePayload,
  createMileageLog,
  deleteMileageLog,
  getMileageSummary,
  listMileageLogs,
  type MileageLog,
  type UpdateMileagePayload,
  updateMileageLog,
} from "../../lib/mileage-api";
import { MileageForm } from "./MileageForm";
import { MileageSummary } from "./MileageSummary";

const recentYears = [
  new Date().getFullYear(),
  new Date().getFullYear() - 1,
  new Date().getFullYear() - 2,
];

interface MileagePageProps {
  clientId: string;
}

export function MileagePage({ clientId }: MileagePageProps) {
  const [selectedYear, setSelectedYear] = useState(recentYears[0]);
  const [editingLog, setEditingLog] = useState<MileageLog | null>(null);
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ["mileage-logs", clientId, selectedYear],
    queryFn: () => listMileageLogs(clientId, selectedYear),
  });

  const { data: summary } = useQuery({
    queryKey: ["mileage-summary", clientId, selectedYear],
    queryFn: () => getMileageSummary(clientId, selectedYear),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateMileagePayload) =>
      createMileageLog({ ...payload, client_id: clientId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mileage-logs", clientId] });
      queryClient.invalidateQueries({ queryKey: ["mileage-summary", clientId] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateMileagePayload }) =>
      updateMileageLog(clientId, id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mileage-logs", clientId] });
      queryClient.invalidateQueries({ queryKey: ["mileage-summary", clientId] });
      setEditingLog(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMileageLog(clientId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mileage-logs", clientId] });
      queryClient.invalidateQueries({ queryKey: ["mileage-summary", clientId] });
    },
  });

  const handleCreate = (payload: CreateMileagePayload | UpdateMileagePayload) => {
    if ("client_id" in payload) {
      createMutation.mutate(payload as CreateMileagePayload);
    } else {
      updateMutation.mutate({ id: editingLog!.id, payload });
    }
  };

  const handleUpdate = (payload: UpdateMileagePayload) => {
    if (editingLog) {
      updateMutation.mutate({ id: editingLog.id, payload });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this mileage log?")) {
      deleteMutation.mutate(id);
    }
  };

  if (logsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Mileage Tracking</h1>
          <p className="text-sm text-gray-600">Track business mileage for tax deductions</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {recentYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Add Mileage Log
          </button>
        </div>
      </div>

      {/* Summary */}
      {summary && <MileageSummary summary={summary} />}

      {/* Forms - Render as overlays */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <MileageForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
          </div>
        </div>
      )}

      {editingLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <MileageForm
              log={editingLog}
              onSubmit={handleUpdate}
              onCancel={() => setEditingLog(null)}
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Purpose
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Route
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Miles
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Deduction
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs && logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.date}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium">{log.purpose}</div>
                      {log.notes && <div className="text-xs text-gray-500 mt-1">{log.notes}</div>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {log.origin} → {log.destination}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.miles_real.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${(log.rate_cents / 100).toFixed(2)} / mi
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      ${formatCents(log.deduction_cents)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => setEditingLog(log)}
                          className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(log.id)}
                          className="text-red-600 hover:text-red-800 font-medium transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12">
                    <div className="flex flex-col items-center justify-center text-center">
                      <p className="text-lg font-medium text-gray-900 mb-2">No mileage logs yet</p>
                      <p className="text-sm text-gray-500 mb-4">
                        Track your business mileage for tax deductions
                      </p>
                      <button
                        onClick={() => setShowForm(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        Add Your First Log
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
