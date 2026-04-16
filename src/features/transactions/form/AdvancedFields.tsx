import { useI18n } from "../../../lib/i18n";
import { today } from "../../../lib/utils";

interface AdvancedFieldsProps {
  txnDate: string;
  description: string;
  reference: string;
  onDateChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onReferenceChange: (v: string) => void;
}

export function AdvancedFields({
  txnDate,
  description,
  reference,
  onDateChange,
  onDescriptionChange,
  onReferenceChange,
}: AdvancedFieldsProps) {
  const { t } = useI18n();

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="adv-date" className="block text-xs font-medium text-gray-600 mb-1">
            Date
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="adv-date"
              type="date"
              value={txnDate}
              onChange={(e) => onDateChange(e.target.value)}
              required
              className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => onDateChange(today())}
              className="px-2 py-1.5 text-xs text-gray-500 border border-gray-300 rounded hover:bg-gray-50 whitespace-nowrap"
            >
              Today
            </button>
          </div>
        </div>
        <div className="col-span-2">
          <label htmlFor="adv-description" className="block text-xs font-medium text-gray-600 mb-1">
            {t("Description")} <span className="text-red-400">*</span>
          </label>
          <input
            id="adv-description"
            type="text"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Transaction description"
            required
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="adv-reference" className="block text-xs font-medium text-gray-600 mb-1">
          Reference (optional)
        </label>
        <input
          id="adv-reference"
          type="text"
          value={reference}
          onChange={(e) => onReferenceChange(e.target.value)}
          placeholder="Check #, invoice #, etc."
          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
        />
      </div>
    </>
  );
}
