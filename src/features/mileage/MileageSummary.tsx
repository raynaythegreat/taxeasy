import { type MileageSummary } from "../../lib/mileage-api";

interface MileageSummaryProps {
  summary: MileageSummary;
}

export function MileageSummary({ summary }: MileageSummaryProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="text-sm font-medium text-gray-500 mb-1">Total Miles</div>
        <div className="text-2xl font-bold text-gray-900">
          {summary.total_miles.toFixed(1)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {summary.log_count} {summary.log_count === 1 ? "trip" : "trips"}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="text-sm font-medium text-gray-500 mb-1">
          Total Deduction
        </div>
        <div className="text-2xl font-bold text-gray-900">
          ${(summary.total_deduction_cents / 100).toFixed(2)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Tax year {summary.year}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="text-sm font-medium text-gray-500 mb-1">
          Avg. Deduction per Trip
        </div>
        <div className="text-2xl font-bold text-gray-900">
          ${summary.log_count > 0
            ? (summary.total_deduction_cents / summary.log_count / 100).toFixed(2)
            : "0.00"}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Per trip average
        </div>
      </div>
    </div>
  );
}
