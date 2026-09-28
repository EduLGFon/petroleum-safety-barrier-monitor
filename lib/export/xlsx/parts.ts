// xlsx static parts - the package plumbing every workbook carries.
// Why it exists: content types, relationships, the workbook itself and the
// document properties never depend on the rows, so they are built once here
// and the data sheet stays the only part that streams.
import { NS_MAIN } from "./styles.ts";
import { cellRef, escXml, inlineStr, rowXml, xmlDoc } from "./xml.ts";

const NS_PKG_REL =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_OFFICE_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_CORE =
  "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
const NS_DC = "http://purl.org/dc/elements/1.1/";
const NS_DCTERMS = "http://purl.org/dc/terms/";
const NS_XSI = "http://www.w3.org/2001/XMLSchema-instance";
const NS_APP =
  "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";

// Sheet names, also referenced by docProps/app.xml.
export const DATA_SHEET = "Barreiras";
export const SUMMARY_SHEET = "Resumo";

const WORKSHEET_CT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";

// contentTypes: declares every part of the package. The data and summary
// sheets are listed up front even though the data one streams afterwards.
export function contentTypes(): string {
  return `${xmlDoc()}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="${WORKSHEET_CT}"/>` +
    `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="${WORKSHEET_CT}"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`;
}

// rootRels: package root -> workbook plus the document properties.
export function rootRels(): string {
  return `${xmlDoc()}<Relationships xmlns="${NS_PKG_REL}">` +
    `<Relationship Id="rId1" Type="${NS_OFFICE_REL}/officeDocument" Target="xl/workbook.xml"/>` +
    `<Relationship Id="rId2" Type="${NS_PKG_REL}/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="${NS_OFFICE_REL}/extended-properties" Target="docProps/app.xml"/>` +
    `</Relationships>`;
}

// workbook: the sheet list. Names are fixed here, so they are stable for
// formulas and for anyone scripting the file.
export function workbook(): string {
  return `${xmlDoc()}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_OFFICE_REL}">` +
    `<sheets>` +
    `<sheet name="${DATA_SHEET}" sheetId="1" r:id="rId1"/>` +
    `<sheet name="${SUMMARY_SHEET}" sheetId="2" r:id="rId2"/>` +
    `</sheets></workbook>`;
}

// workbookRels: workbook -> the two sheets and the style table.
export function workbookRels(): string {
  return `${xmlDoc()}<Relationships xmlns="${NS_PKG_REL}">` +
    `<Relationship Id="rId1" Type="${NS_OFFICE_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="${NS_OFFICE_REL}/worksheet" Target="worksheets/sheet2.xml"/>` +
    `<Relationship Id="rId3" Type="${NS_OFFICE_REL}/styles" Target="styles.xml"/>` +
    `</Relationships>`;
}

// coreProps: title/creator/timestamps, so the file identifies itself in
// Excel's properties panel instead of showing the import name.
export function coreProps(title: string, companyName: string): string {
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  return `${xmlDoc()}<cp:coreProperties xmlns:cp="${NS_CORE}" xmlns:dc="${NS_DC}" xmlns:dcterms="${NS_DCTERMS}" xmlns:xsi="${NS_XSI}">` +
    `<dc:title>${escXml(title)}</dc:title>` +
    `<dc:creator>${
      escXml(companyName || "Monitor de Barreiras de Segurança")
    }</dc:creator>` +
    `<cp:lastModifiedBy>${
      escXml(companyName || "Monitor de Barreiras de Segurança")
    }</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>` +
    `</cp:coreProperties>`;
}

// appProps: names the sheets in the document properties.
export function appProps(): string {
  return `${xmlDoc()}<Properties xmlns="${NS_APP}">` +
    `<Application>Monitor de Barreiras de Segurança</Application>` +
    `<TitlesOfParts><vt:vector xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes" size="2" baseType="lpstr">` +
    `<vt:lpstr>${DATA_SHEET}</vt:lpstr><vt:lpstr>${SUMMARY_SHEET}</vt:lpstr>` +
    `</vt:vector></TitlesOfParts>` +
    `</Properties>`;
}

// summarySheet: the indicator table (same rows as the CSV RESUMO block and the
// print report footer), so the workbook carries the reconciling totals on a
// sheet of their own instead of a table glued below the data.
export function summarySheet(
  rows: Array<[string, string]>,
  titleStyle: number,
  labelStyle: number,
  valueStyle: number,
): string {
  const body = rows.map(([label, value], i) =>
    rowXml(
      i + 2,
      inlineStr(cellRef(1, i + 2), label, labelStyle) +
        inlineStr(cellRef(2, i + 2), value, valueStyle),
    )
  ).join("");
  return `${xmlDoc()}<worksheet xmlns="${NS_MAIN}">` +
    `<sheetData>${
      rowXml(1, inlineStr("A1", "Resumo", titleStyle))
    }${body}</sheetData>` +
    `</worksheet>`;
}
