import { invoke } from "@tauri-apps/api/core";

export async function exportTransactionsCsv(dateFrom: string, dateTo: string): Promise<string> {
  return invoke("export_transactions_csv", { dateFrom, dateTo });
}

export async function exportReportCsv(reportType: string, dateFrom: string, dateTo: string): Promise<string> {
  return invoke("export_report_csv", { reportType, dateFrom, dateTo });
}

export async function saveCsvFile(csvContent: string, defaultFilename: string): Promise<string> {
  return invoke("save_csv_file", { csvContent, defaultFilename });
}

export async function handleExportReport(reportType: string, dateFrom: string, dateTo: string) {
  const csv = await exportReportCsv(reportType, dateFrom, dateTo);
  return saveCsvFile(csv, `${reportType}-report.csv`);
}
