import { useQuery } from "@tanstack/react-query";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Eye, Printer } from "lucide-react";
import { useState } from "react";
import type { BusinessProfile } from "../../lib/business-profile-api";
import { getBusinessProfile } from "../../lib/business-profile-api";
import { useI18n } from "../../lib/i18n";
import type { InvoiceDetail } from "../../lib/invoice-api";
import { cn } from "../../lib/utils";
import { generateInvoiceHtml, type InvoiceTemplate } from "./invoice-templates";

const TEMPLATE_OPTIONS: { value: InvoiceTemplate; label: string }[] = [
  { value: "modern", label: "Modern" },
  { value: "classic", label: "Classic" },
  { value: "minimal", label: "Minimal" },
];

async function loadImageAsBase64(path: string): Promise<string | undefined> {
  try {
    const url = convertFileSrc(path);
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

interface InvoicePreviewProps {
  invoice: InvoiceDetail;
  profile?: BusinessProfile;
  onClose: () => void;
}

export function InvoicePreview({ invoice, profile: profileProp, onClose }: InvoicePreviewProps) {
  const { t } = useI18n();
  const [template, setTemplate] = useState<InvoiceTemplate>("modern");
  const [logoBase64, setLogoBase64] = useState<string | undefined>();

  const { data: fetchedProfile } = useQuery({
    queryKey: ["business-profile"],
    queryFn: getBusinessProfile,
    enabled: !profileProp,
  });

  const profile = profileProp ?? fetchedProfile;

  useQuery({
    queryKey: ["logo-base64", profile?.profile_image_path],
    queryFn: async () => {
      if (!profile?.profile_image_path) {
        setLogoBase64(undefined);
        return null;
      }
      const b64 = await loadImageAsBase64(profile.profile_image_path);
      setLogoBase64(b64);
      return b64;
    },
    enabled: !!profile?.profile_image_path,
  });

  async function handlePrint() {
    if (!profile) return;
    const html = generateInvoiceHtml(invoice, profile, template, logoBase64);
    await invoke("print_html", { html });
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        {t("Loading…")}
      </div>
    );
  }

  const previewHtml = generateInvoiceHtml(invoice, profile, template, logoBase64);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-100">
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <Eye className="w-4 h-4" />
        </button>
        <h1 className="text-sm font-semibold text-gray-900 truncate">
          {t("Preview")} — {invoice.invoice_number}
        </h1>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {TEMPLATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTemplate(opt.value)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                template === opt.value
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-500 hover:text-gray-700",
              )}
            >
              {t(opt.label)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Printer className="w-3.5 h-3.5" />
          {t("Print")}
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-gray-100 p-6">
        <div className="max-w-[860px] mx-auto">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <iframe
              srcDoc={previewHtml}
              title="Invoice Preview"
              className="w-full border-0"
              style={{ height: "700px", minHeight: "500px" }}
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
