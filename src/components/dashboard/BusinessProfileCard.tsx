import { Building2 } from "lucide-react";
import type { BusinessProfile } from "../../lib/business-profile-api";
import { useI18n } from "../../lib/i18n";
import type { EntityType } from "../../lib/tauri";
import { maskEin } from "../../lib/utils";

const ENTITY_LABELS: Record<EntityType, string> = {
  sole_prop: "Sole Proprietor",
  smllc: "SMLLC",
  scorp: "S-Corp",
  ccorp: "C-Corp",
  partnership: "Partnership",
  i1040: "1040 Individual",
};

interface BusinessProfileCardProps {
  profile: BusinessProfile;
  onNavigate: (page: string) => void;
}

export function BusinessProfileCard({ profile, onNavigate }: BusinessProfileCardProps) {
  const { t } = useI18n();

  return (
    <div className="bg-white border-b border-gray-200 px-8 py-5">
      <div className="flex items-start gap-5">
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{profile.name}</h2>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                  {ENTITY_LABELS[profile.entity_type as EntityType] ?? profile.entity_type}
                </span>
                <span className="text-xs text-gray-400 capitalize">
                  {profile.accounting_method} {t("basis")}
                </span>
                {profile.ein && (
                  <span className="text-xs text-gray-500">
                    {t("EIN")}: {maskEin(profile.ein)}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("settings")}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t("Edit Profile")}
            </button>
          </div>
          <div className="flex items-center gap-5 mt-3 text-xs text-gray-500">
            {profile.contact_name && <span>{profile.contact_name}</span>}
            {profile.email && <span>{profile.email}</span>}
            {profile.phone && <span>{profile.phone}</span>}
          </div>
          {(profile.address_line1 || profile.city) && (
            <div className="mt-2 text-sm text-gray-500">
              {[
                profile.address_line1,
                profile.address_line2,
                profile.city,
                profile.state,
                profile.postal_code,
              ]
                .filter(Boolean)
                .join(", ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
