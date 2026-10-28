"""Fill Round 1 results into docs/Report5_Test Report.xlsx from Playwright / Jest JSON.

Only the Round 1 result cell (column F) and its date cell (column G) of rows whose
test case ID appears in the results are written. Tester (H) and Note (O) are never
touched. The workbook XML is patched directly so charts, formulas and validation
survive. Strict rule: a case is Passed only if every test carrying its ID passed
as expected, Failed if a test marked as an expected failure failed, and untouched
otherwise.

Usage: python -I fill-results.py <sheet name> <ID prefix> <date> <results.json> [...]
"""
import json
import re
import sys
import zipfile
from xml.sax.saxutils import escape

import openpyxl

XLSX = "docs/Report5_Test Report.xlsx"


def playwright_outcomes(path):
    data = json.load(open(path, encoding="utf-8"))
    outcomes = {}

    def walk(node):
        for spec in node.get("specs", []):
            for test in spec.get("tests", []):
                results = test.get("results", [])
                if not results:
                    continue
                status = results[-1]["status"]
                expected = test.get("expectedStatus", "passed")
                yield spec["title"], expected, status
        for child in node.get("suites", []):
            yield from walk(child)

    for title, expected, status in walk(data):
        match = re.match(r"([A-Z]+(?:-[A-Z]+)*-\d+)", title)
        if not match:
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
            match = re.match(r"([A-Z]+-\d+)", test["title"])
            if match:
                verdict = "Passed" if test["status"] == "passed" else "Unexpected"
                outcomes.setdefault(match.group(1), []).append(verdict)
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
    sheet, prefix, date, *sources = sys.argv[1:]
    outcomes = {}
    for source in sources:
        loader = jest_outcomes if "jest" in source.lower() else playwright_outcomes
        for case_id, verdicts in loader(source).items():
            outcomes.setdefault(case_id, []).extend(verdicts)

    workbook = openpyxl.load_workbook(XLSX)
    worksheet = workbook[sheet]
    rows = {
        row[0].value: row[0].row
        for row in worksheet.iter_rows(min_row=11)
        if isinstance(row[0].value, str) and re.fullmatch(prefix + r"-\d+", row[0].value)
    }

    archive = zipfile.ZipFile(XLSX)
    workbook_xml = archive.read("xl/workbook.xml").decode()
    rels = archive.read("xl/_rels/workbook.xml.rels").decode()
    rid = re.search(r'<sheet name="%s"[^>]*r:id="([^"]+)"' % re.escape(escape(sheet, {'"': "&quot;"})), workbook_xml).group(1)
    target = re.search(r'<Relationship Id="%s"[^>]*Target="([^"]+)"' % rid, rels).group(1)
    path = "xl/" + target
    xml = archive.read(path).decode()

    written = {"Passed": 0, "Failed": 0}
    skipped = []
    for case_id, verdicts in sorted(outcomes.items()):
        if case_id not in rows:
            continue
        verdict = combine(verdicts)
        if verdict is None:
            skipped.append(case_id)
            continue
        row = rows[case_id]
        xml = set_cell(xml, "F%d" % row, verdict)
        xml = set_cell(xml, "G%d" % row, date)
        written[verdict] += 1

    calc = workbook_xml
    if "fullCalcOnLoad" not in calc:
        calc = re.sub(r"<calcPr([^>]*)/>", r'<calcPr\1 fullCalcOnLoad="1"/>', calc)

    patched = {path: xml.encode(), "xl/workbook.xml": calc.encode()}
    tmp = XLSX + ".tmp"
    with zipfile.ZipFile(tmp, "w") as out:
        for info in archive.infolist():
            data = patched.get(info.filename, None)
            out.writestr(info, data if data is not None else archive.read(info.filename), compress_type=zipfile.ZIP_DEFLATED)
    archive.close()
    import os

    os.replace(tmp, XLSX)
    print("written", written, "skipped (unexpected outcome)", skipped)


main()
