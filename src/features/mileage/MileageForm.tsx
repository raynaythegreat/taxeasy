import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getIrsMileageRate,
  type MileageLog,
  type CreateMileagePayload,
  type UpdateMileagePayload,
} from "../../lib/mileage-api";

interface MileageFormProps {
  log?: MileageLog;
  onSubmit: (payload: CreateMileagePayload | UpdateMileagePayload) => void;
  onCancel: () => void;
}

export function MileageForm({ log, onSubmit, onCancel }: MileageFormProps) {
  const isEditing = !!log;
  const currentYear = new Date().getFullYear();

  const { data: rate } = useQuery({
    queryKey: ["irs-mileage-rate", currentYear],
    queryFn: () => getIrsMileageRate(currentYear),
  });

  const [formData, setFormData] = useState({
    date: log?.date || new Date().toISOString().split("T")[0],
    purpose: log?.purpose || "",
    origin: log?.origin || "",
    destination: log?.destination || "",
    miles_real: log?.miles_real || 0,
    notes: log?.notes || "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!formData.date) newErrors.date = "Date is required";
    if (!formData.purpose) newErrors.purpose = "Purpose is required";
    if (!formData.origin) newErrors.origin = "Origin is required";
    if (!formData.destination) newErrors.destination = "Destination is required";
    if (formData.miles_real <= 0) newErrors.miles_real = "Miles must be greater than 0";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (isEditing) {
      const payload: UpdateMileagePayload = {
        date: formData.date,
        purpose: formData.purpose,
        origin: formData.origin,
        destination: formData.destination,
        miles_real: formData.miles_real,
        notes: formData.notes || undefined,
      };
      onSubmit(payload);
    } else {
      const payload: CreateMileagePayload = {
        client_id: "",
        date: formData.date,
        purpose: formData.purpose,
        origin: formData.origin,
        destination: formData.destination,
        miles_real: formData.miles_real,
        notes: formData.notes || undefined,
      };
      onSubmit(payload);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">
        {isEditing ? "Edit Mileage Log" : "Add Mileage Log"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date *
            </label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {errors.date && (
              <p className="text-red-600 text-xs mt-1">{errors.date}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Purpose *
            </label>
            <input
              type="text"
              name="purpose"
              value={formData.purpose}
              onChange={handleChange}
              placeholder="e.g., Client meeting, Site visit"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {errors.purpose && (
              <p className="text-red-600 text-xs mt-1">{errors.purpose}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Origin *
            </label>
            <input
              type="text"
              name="origin"
              value={formData.origin}
              onChange={handleChange}
              placeholder="e.g., Office"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {errors.origin && (
              <p className="text-red-600 text-xs mt-1">{errors.origin}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Destination *
            </label>
            <input
              type="text"
              name="destination"
              value={formData.destination}
              onChange={handleChange}
              placeholder="e.g., Client office"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {errors.destination && (
              <p className="text-red-600 text-xs mt-1">{errors.destination}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Miles *
            </label>
            <input
              type="number"
              step="0.1"
              name="miles_real"
              value={formData.miles_real}
              onChange={handleChange}
              placeholder="0.0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {errors.miles_real && (
              <p className="text-red-600 text-xs mt-1">{errors.miles_real}</p>
            )}
            {rate && (
              <p className="text-xs text-gray-500 mt-1">
                IRS Rate: ${(rate.rate_cents / 100).toFixed(2)} / mile
              </p>
            )}
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Additional details..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {isEditing ? "Update" : "Add"} Log
          </button>
        </div>
      </form>
    </div>
  );
}
