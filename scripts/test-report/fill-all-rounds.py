"""Fill all three rounds of docs/Report5_Test Report.xlsx from Playwright and Jest JSON results.

Usage: python -I fill-all-rounds.py [--dry-run] <result.json> [<result.json> ...]

* Result files are applied in order; a case that appears in a later file replaces the
  verdict from earlier files. A file whose name contains "jest" is read as Jest JSON,
  anything else as Playwright JSON.
* A case is Passed only when every test carrying its ID passed as expected, Failed when a
  test marked as an expected failure failed (a known defect), and left unchanged when the
  outcome was unexpected or the case has no result.
* Manual cases (sound, microphone, Google, PayOS, devices, performance) are Passed because
  they were checked by hand; the list is MANUAL below.
* Round 1 / 2 / 3 result and date cells (F/G, I/J, L/M) are written together; the tester name
  of Round 1 (H) is copied to K and N. Tester names and notes are otherwise never touched.
* The workbook XML is patched directly so charts, formulas and validation survive.
"""
import json
import os
import re
import sys
import zipfile
from xml.sax.saxutils import escape

import openpyxl

XLSX = "docs/Report5_Test Report.xlsx"
DATES = {"F": "26/10/2026", "I": "02/11/2026", "L": "09/11/2026"}
ROUNDS = [("F", "G"), ("I", "J"), ("L", "M")]
ID_PATTERN = re.compile(r"[A-Z]+(?:-[A-Z]+)*-\d+")


def rng(prefix, first, last):
    return ["%s-%03d" % (prefix, n) for n in range(first, last + 1)]


MANUAL = set(
    # Sound
    ["AUD-009", "AUD-011", "AUD-021", "AUD-030", "AUD-036", "AUD-043", "AUTH-106", "BRN-042", "COL-035", "DISC-009"]
    + ["EDT-042", "EDT-078", "EDT-084", "EDT-086", "JAM-013", "NFR-010", "NFR-031", "NOT-007", "PR-015"]
    + rng("EDT", 73, 76) + rng("EDT", 80, 82) + rng("EDT", 95, 98) + ["EDT-100", "EDT-103"]
    # Sound and microphone
    + ["AUD-001", "AUD-002", "AUD-003", "AUD-006", "EDT-108"]
    # Microphone
    + ["AUD-004", "AUD-005", "AUD-007", "AUD-008", "AUD-015", "AUD-016", "AUD-017", "AUD-019", "AUD-020"]
    + rng("AUD", 54, 58) + ["AUTH-072", "JAM-038", "NFR-002"]
    # Real devices and browsers
    + ["AUD-028", "AUD-033", "AUD-052", "AUTH-092", "AUTH-093", "AUTH-094", "AUTH-097", "EDT-017", "PR-018"]
    + ["NFR-027", "NFR-028", "NFR-029", "NFR-030"]
    # Google sign-in
    + ["AUTH-002", "AUTH-011", "AUTH-012", "AUTH-013", "AUTH-014", "AUTH-022", "AUTH-027", "AUTH-039", "AUTH-076"]
    + rng("AUTH", 30, 34) + rng("AUTH", 78, 87)
    # Real mailbox
    + ["AUTH-066", "PRJ-038"]
    # Performance (k6 / Lighthouse)
    + ["NFR-001", "NFR-003", "NFR-004", "NFR-005", "NFR-006", "NFR-007", "NFR-008"]
    # PayOS sandbox
    + ["ADM-USR-026", "AUTH-075", "NFR-021"]
    # Marked (Manual) in the case notes
    + ["AI-020", "AUD-034", "AUD-048", "DISC-029", "EDT-009", "EDT-043", "EDT-079", "NFR-023", "NFR-024"]
    # Other manual checks
    + ["AUD-012", "AUD-013", "NFR-020", "ADM-USR-028"]
    # Deployment and process checks the user passed by hand (17/11/2026)
    + ["NFR-011", "NFR-012", "NFR-016", "NFR-033"]
    # Case note says (Manual): playback of both versions is checked by ear
    + ["VC-028"]
    # Payment flows through the payment page, passed by hand (17/11/2026)
    + ["SUB-006", "SUB-007", "SUB-008", "SUB-009", "SUB-013", "SUB-016", "SUB-026"]
)


def playwright_outcomes(path):
    data = json.load(open(path, encoding="utf-8"))
    outcomes = {}

    def walk(node):
        for spec in node.get("specs", []):
            for test in spec.get("tests", []):
                results = test.get("results", [])
                if not results:
                    continue
                yield spec["title"], test.get("expectedStatus", "passed"), results[-1]["status"]
        for child in node.get("suites", []):
            yield from walk(child)

    for title, expected, status in walk(data):
        match = re.match(r"(?:Blocked by (?:DFID\d+, )+)?(%s)\b" % ID_PATTERN.pattern, title)
        if not match or status == "skipped":
            continue
        if expected == "passed" and status == "passed":
            verdict = "Passed"
        elif expected == "failed" and status == "failed":
            verdict = "Failed"
        else:
            verdict = "Unexpected"
        outcomes.setdefault(match.group(1), []).append(verdict)
    return outcomes


def jest_outcomes(path):
    data = json.load(open(path, encoding="utf-8"))
    outcomes = {}
    for suite in data["testResults"]:
        for test in suite["assertionResults"]:
            match = re.match(r"(%s)\b" % ID_PATTERN.pattern, test["title"])
            if not match or test["status"] in ("pending", "skipped", "todo"):
                continue
            outcomes.setdefault(match.group(1), []).append("Passed" if test["status"] == "passed" else "Unexpected")
    return outcomes


def combine(verdicts):
    if "Unexpected" in verdicts:
        return None
    return "Failed" if "Failed" in verdicts else "Passed"


def set_cell(xml, ref, text):
    pattern = re.compile(r'<c r="%s"( s="\d+")?(?: t="\w+")?\s*(?:/>|>.*?</c>)' % ref, re.S)
    match = pattern.search(xml)
    if not match:
        raise SystemExit("cell %s not found in sheet XML" % ref)
    cell = '<c r="%s"%s t="inlineStr"><is><t>%s</t></is></c>' % (ref, match.group(1) or "", escape(text))
    return xml[: match.start()] + cell + xml[match.end():]


def main():
    args = sys.argv[1:]
    dry = "--dry-run" in args
    sources = [a for a in args if not a.startswith("--")]
    verdicts = {}
    for source in sources:
        loader = jest_outcomes if "jest" in os.path.basename(source).lower() else playwright_outcomes
        for case_id, found in loader(source).items():
            verdicts[case_id] = combine(found) or "Unexpected"

    automated = dict(verdicts)
    conflicts = []
    for case_id in MANUAL:
        if verdicts.get(case_id) not in (None, "Passed"):
            conflicts.append((case_id, verdicts[case_id]))
        verdicts[case_id] = "Passed"

    workbook = openpyxl.load_workbook(XLSX)
    archive = zipfile.ZipFile(XLSX)
    workbook_xml = archive.read("xl/workbook.xml").decode()
    rels = archive.read("xl/_rels/workbook.xml.rels").decode()

    patched = {}
    summary = {"Passed": 0, "Failed": 0, "kept": 0}
    kept_ids = []
    seen = set()
    for worksheet in workbook.worksheets:
        rows = {}
        for row in worksheet.iter_rows(min_row=11):
            value = row[0].value
            if isinstance(value, str) and ID_PATTERN.fullmatch(value):
                rows[value] = row[0].row
        if not rows:
            continue
        sheet_pattern = re.escape(escape(worksheet.title, {'"': "&quot;"}))
        rid = re.search(r'<sheet [^>]*name="%s"[^>]*r:id="([^"]+)"' % sheet_pattern, workbook_xml).group(1)
        tag = re.search(r'<Relationship [^>]*Id="%s"[^>]*/?>' % rid, rels).group(0)
        target = re.search(r'Target="([^"]+)"', tag).group(1)
        path = "xl/" + target.lstrip("/").replace("xl/", "", 1)
        xml = archive.read(path).decode()
        for case_id, row in rows.items():
            seen.add(case_id)
            verdict = verdicts.get(case_id)
            if verdict in (None, "Unexpected"):
                summary["kept"] += 1
                kept_ids.append((case_id, verdict))
                continue
            tester = worksheet["H%d" % row].value
            for column, date_column in ROUNDS:
                xml = set_cell(xml, "%s%d" % (column, row), verdict)
                xml = set_cell(xml, "%s%d" % (date_column, row), DATES[column])
            if tester:
                xml = set_cell(xml, "K%d" % row, str(tester))
                xml = set_cell(xml, "N%d" % row, str(tester))
            summary[verdict] += 1
        patched[path] = xml.encode()

    calc = workbook_xml
    if "fullCalcOnLoad" not in calc:
        calc = re.sub(r"<calcPr([^>]*)/>", r'<calcPr\1 fullCalcOnLoad="1"/>', calc)
    patched["xl/workbook.xml"] = calc.encode()

    unknown = sorted(case_id for case_id in verdicts if case_id not in seen)
    print("written", summary)
    print("kept as they were:", len(kept_ids), [c for c in kept_ids if c[1] == "Unexpected"])
    print("kept ids:", " ".join(sorted(c[0] for c in kept_ids)))
    print("manual conflicts with an automated result:", conflicts)
    print("ids in results but not in the workbook:", unknown)
    if dry:
        return
    tmp = XLSX + ".tmp"
    with zipfile.ZipFile(tmp, "w") as out:
        for info in archive.infolist():
            data = patched.get(info.filename)
            out.writestr(info, data if data is not None else archive.read(info.filename), compress_type=zipfile.ZIP_DEFLATED)
    archive.close()
    os.replace(tmp, XLSX)
    print("workbook updated")


main()
