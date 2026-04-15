import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Report, SecurityIssue } from '@/context/AppContext';

// ─── CSV Export ───

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportSecurityIssuesCsv(issues: SecurityIssue[], filename = 'security_issues.csv') {
  const headers = ['File', 'Line', 'Severity', 'Standard', 'Title', 'Description', 'Recommendation', 'Flagged Code'];
  const rows = issues.map(i => [
    i.file, String(i.line), i.severity, i.standard, i.title, i.description, i.recommendation, i.code
  ]);
  const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
  downloadBlob(csv, filename, 'text/csv;charset=utf-8;');
}

export function exportReportsCsv(reports: Report[], filename = 'conversion_reports.csv') {
  const headers = ['ID', 'Date', 'Success', 'Files', 'Execution Time (ms)', 'Security Issues'];
  const rows = reports.map(r => [
    String(r.id),
    r.timestamp.toLocaleString(),
    r.success ? 'Yes' : 'No',
    String(r.filesCount || 1),
    String(r.executionTime),
    String(r.securityIssues.length),
  ]);
  const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
  downloadBlob(csv, filename, 'text/csv;charset=utf-8;');
}

// ─── PDF Export ───

export function exportSecurityIssuesPdf(issues: SecurityIssue[], filename = 'security_report.pdf') {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('Security Scan Report', 14, 22);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
  doc.text(`Total Issues: ${issues.length}`, 14, 36);

  const high = issues.filter(i => i.severity === 'high').length;
  const medium = issues.filter(i => i.severity === 'medium').length;
  const low = issues.filter(i => i.severity === 'low').length;
  doc.text(`High: ${high}  |  Medium: ${medium}  |  Low: ${low}`, 14, 42);

  autoTable(doc, {
    startY: 50,
    head: [['File', 'Line', 'Severity', 'Standard', 'Title', 'Recommendation']],
    body: issues.map(i => [
      i.file, String(i.line), i.severity.toUpperCase(), i.standard, i.title, i.recommendation
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246] },
    columnStyles: {
      2: { fontStyle: 'bold' },
    },
  });

  doc.save(filename);
}

export function exportReportsPdf(reports: Report[], filename = 'conversion_report.pdf') {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('Conversion Summary Report', 14, 22);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

  const totalFiles = reports.reduce((s, r) => s + (r.filesCount || 1), 0);
  const successful = reports.reduce((s, r) => s + (r.success ? (r.filesCount || 1) : 0), 0);
  const totalIssues = reports.reduce((s, r) => s + r.securityIssues.length, 0);
  const avgTime = totalFiles > 0
    ? (reports.reduce((s, r) => s + r.executionTime, 0) / totalFiles / 1000).toFixed(1)
    : '0.0';

  doc.text(`Total Files Converted: ${totalFiles}`, 14, 38);
  doc.text(`Success Rate: ${totalFiles > 0 ? ((successful / totalFiles) * 100).toFixed(1) : 0}%`, 14, 44);
  doc.text(`Security Issues Found: ${totalIssues}`, 14, 50);
  doc.text(`Avg Time Per File: ${avgTime}s`, 14, 56);

  autoTable(doc, {
    startY: 64,
    head: [['#', 'Date', 'Success', 'Files', 'Time (ms)', 'Security Issues']],
    body: reports.map(r => [
      String(r.id),
      r.timestamp.toLocaleString(),
      r.success ? 'Yes' : 'No',
      String(r.filesCount || 1),
      String(r.executionTime),
      String(r.securityIssues.length),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246] },
  });

  doc.save(filename);
}

// ─── Helpers ───

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
