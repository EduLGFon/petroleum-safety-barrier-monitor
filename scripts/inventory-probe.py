# Inventory probe - low-memory streaming analysis of test/inventory.xlsx.
# Why: 17MB workbook (130MB uncompressed, 9 sheets, 100k rows) cannot load
# fully on 1CPU/5GB, so each sheet streams via iterparse with one shared
# strings list preloaded once.
import xml.etree.ElementTree as ET
from collections import Counter
import zipfile
import sys
import re

XLSX = "test/inventory.xlsx";
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}";

def col_to_idx(col):
    n = 0;
    for ch in col:
        n = n * 26 + (ord(ch) - 64);
    return n - 1;

def split_ref(ref):
    m = re.match(r"([A-Z]+)(\d+)", ref or "");
    if not m:
        return (None, None);
    return (m.group(1), int(m.group(2)));

def load_strings(z):
    ss = [];
    with z.open("xl/sharedStrings.xml") as f:
        for _ev, elem in ET.iterparse(f, events=("end",)):
            if elem.tag == NS + "si":
                parts = [];
                for t in elem.iter(NS + "t"):
                    if t.text:
                        parts.append(t.text);
                ss.append("".join(parts));
                elem.clear();
    return ss;

def cell_value(c, ss):
    t = c.get("t");
    v_elem = c.find(NS + "v");
    f_elem = c.find(NS + "f");
    f = f_elem.text if f_elem is not None else None;
    if f_elem is not None and f_elem.get("t") == "shared":
        f = f"[shared si={f_elem.get('si')}]";
    v = v_elem.text if v_elem is not None else None;
    # inline string
    is_elem = c.find(NS + "is");
    if is_elem is not None:
        t_el = is_elem.find(NS + "t");
        v = t_el.text if t_el is not None else "";
        return (v, f, "inline");
    if t == "s" and v is not None:
        try:
            return (ss[int(v)], f, "s");
        except Exception:
            return (v, f, "s-err");
    if t == "str":
        return (v or "", f, "str");
    if t == "b":
        return (v, f, "b");
    if t == "e":
        return (v, f, "e");
    return (v, f, t or "n");

def analyze_sheet(z, ss, idx, name, max_rows=100000, distinct_cap=300):
    path = f"xl/worksheets/sheet{idx}.xml";
    headers = {};
    col_stats = {};  # col_letter -> {count, unique_set_size, counter}
    formulas = Counter();
    n_rows = 0;
    header_rows = {};
    with z.open(path) as f:
        for _ev, elem in ET.iterparse(f, events=("end",)):
            if elem.tag == NS + "row":
                r = int(elem.get("r", "0"));
                n_rows += 1;
                if r <= 3:
                    # capture raw header row values
                    row_vals = {};
                    for c in elem.findall(NS + "c"):
                        ref = c.get("r");
                        col, _row = split_ref(ref);
                        val, form, _typ = cell_value(c, ss);
                        if form:
                            formulas[form[:220]] += 1;
                        row_vals[col] = (str(val)[:160] if val is not None else "");
                    header_rows[r] = row_vals;
                else:
                    for c in elem.findall(NS + "c"):
                        ref = c.get("r");
                        col, _row = split_ref(ref);
                        if col is None:
                            continue;
                        st = col_stats.setdefault(col, {"n": 0, "c": Counter(), "uniq": 0});
                        val, form, _typ = cell_value(c, ss);
                        if form:
                            formulas[form[:220]] += 1;
                        sval = str(val)[:160] if val is not None else "";
                        if sval == "" or sval == "None":
                            continue;
                        st["n"] += 1;
                        if len(st["c"]) < distinct_cap or sval in st["c"]:
                            st["c"][sval] += 1;
                    # periodic clear handled by elem.clear below
                    if n_rows % 5000 == 0:
                        pass;
                elem.clear();
                if n_rows > max_rows:
                    break;
    # summarize
    summary = {"sheet": name, "idx": idx, "rows": n_rows, "headers": header_rows};
    cols = {};
    for col, st in sorted(col_stats.items(), key=lambda x: col_to_idx(x[0])):
        cols[col] = {"nonempty": st["n"], "tracked_unique": len(st["c"]), "top": st["c"].most_common(40)};
    summary["cols"] = cols;
    summary["formulas_top"] = formulas.most_common(60);
    summary["formula_count"] = sum(formulas.values());
    return summary;

def main():
    z = zipfile.ZipFile(XLSX);
    print("loading shared strings...", file=sys.stderr);
    ss = load_strings(z);
    print(f"ss={len(ss)}", file=sys.stderr);
    names = ["GUIA", "BD", "Graf.", "data_Ativos", "Tarefas Pendentes", "GERAL", "TOTAL", "data_SS", "data_OS"];
    import json;
    out = {};
    # small sheets first
    for i, n in enumerate(names, start=1):
        print(f"--- {i} {n} ---", file=sys.stderr);
        # cap distinct for huge sheets to keep output small
        s = analyze_sheet(z, ss, i, n);
        out[n] = s;
        print(f"{n}: rows={s['rows']} formulas={s['formula_count']}", file=sys.stderr);
    with open("/tmp/opencode/inventory-summary.json", "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1);
    print("wrote /tmp/opencode/inventory-summary.json");

if __name__ == "__main__":
    main();
