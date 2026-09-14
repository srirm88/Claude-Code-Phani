from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.utils import get_column_letter
from openpyxl.comments import Comment

OUT = "/home/user/Claude-Code-Phani/tools/ABK_Integration_Team_Tracker.xlsx"
TODAY = date(2026, 9, 14)
def d(n): return TODAY + timedelta(days=n)

FONT = "Arial"
HDR_FILL = PatternFill("solid", fgColor="1F3864")
HDR_FONT = Font(name=FONT, bold=True, color="FFFFFF", size=10)
TITLE_FONT = Font(name=FONT, bold=True, size=14, color="1F3864")
SUB_FONT = Font(name=FONT, italic=True, size=9, color="595959")
BODY = Font(name=FONT, size=10)
BOLD = Font(name=FONT, size=10, bold=True)
CALC_FILL = PatternFill("solid", fgColor="F2F2F2")   # formula columns - do not type here
SECTION_FILL = PatternFill("solid", fgColor="D9E1F2")
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
DATE_FMT = "DD-MMM-YYYY"

wb = Workbook()
wb.remove(wb.active)

# ---------------------------------------------------------------- Lists
LISTS = {
    "Task Status": ["Not Started", "In Progress", "On Hold", "Blocked", "Done", "Cancelled"],
    "Priority": ["Critical", "High", "Medium", "Low"],
    "Project Status": ["Initiation", "In Progress", "On Hold", "UAT", "Go-Live", "Closed"],
    "Project Type": ["ACE Integration", "MQ", "API Gateway", "Upgrade / Fixpack", "BAU Support"],
    "Task Category": ["Design", "Build", "Review", "Testing", "Deployment", "Governance", "Meeting", "Support"],
    "Environment": ["DEV", "SIT", "UAT", "PRE-PROD", "PROD"],
    "RAG": ["Green", "Amber", "Red"],
    "Deploy Result": ["Success", "Failed", "Rolled Back"],
}
ws_l = wb.create_sheet("Lists")
ws_l["A1"] = "Dropdown values. Edit these to change the vocabulary used across the workbook. Do not insert columns."
ws_l["A1"].font = SUB_FONT
for ci, (name, vals) in enumerate(LISTS.items(), start=1):
    c = ws_l.cell(row=3, column=ci, value=name); c.font = HDR_FONT; c.fill = HDR_FILL
    for ri, v in enumerate(vals, start=4):
        ws_l.cell(row=ri, column=ci, value=v).font = BODY
    ws_l.column_dimensions[get_column_letter(ci)].width = 18
# settings
ws_l["J3"] = "Setting"; ws_l["K3"] = "Value"
for c in ("J3", "K3"): ws_l[c].font = HDR_FONT; ws_l[c].fill = HDR_FILL
ws_l["J4"] = "My name (as used in Tasks > Assigned To)"; ws_l["K4"] = "Phani"
ws_l["J4"].font = BODY; ws_l["K4"].font = Font(name=FONT, size=10, color="0000FF", bold=True)
ws_l["K4"].fill = PatternFill("solid", fgColor="FFFF00")
ws_l["J5"] = "Dashboard 'due soon' window (days)"; ws_l["K5"] = 7
ws_l["J5"].font = BODY; ws_l["K5"].font = Font(name=FONT, size=10, color="0000FF", bold=True)
ws_l["K5"].fill = PatternFill("solid", fgColor="FFFF00")
ws_l.column_dimensions["J"].width = 40; ws_l.column_dimensions["K"].width = 12
ws_l.freeze_panes = "A4"

def list_ref(name):
    ci = list(LISTS).index(name) + 1
    col = get_column_letter(ci)
    return f"=Lists!${col}$4:${col}${3 + len(LISTS[name])}"

MYNAME = "Lists!$K$4"
DUESOON = "Lists!$K$5"

# ---------------------------------------------------------------- helpers
def header_block(ws, title, subtitle, headers, widths, hdr_row=4):
    ws["A1"] = title; ws["A1"].font = TITLE_FONT
    ws["A2"] = subtitle; ws["A2"].font = SUB_FONT
    for ci, h in enumerate(headers, start=1):
        c = ws.cell(row=hdr_row, column=ci, value=h)
        c.font = HDR_FONT; c.fill = HDR_FILL; c.border = BORDER
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(ci)].width = widths[ci - 1]
    ws.row_dimensions[hdr_row].height = 30
    ws.freeze_panes = ws.cell(row=hdr_row + 1, column=1)

def style_rows(ws, first, last, ncols, calc_cols=(), date_cols=(), pct_cols=(), int_cols=()):
    for r in range(first, last + 1):
        for ci in range(1, ncols + 1):
            c = ws.cell(row=r, column=ci)
            c.font = BODY; c.border = BORDER
            c.alignment = Alignment(vertical="top", wrap_text=(ci not in date_cols))
            if ci in calc_cols: c.fill = CALC_FILL
            if ci in date_cols: c.number_format = DATE_FMT
            if ci in pct_cols: c.number_format = "0%"
            if ci in int_cols: c.number_format = "0"

def add_dv(ws, rng, formula, allow_blank=True):
    dv = DataValidation(type="list", formula1=formula, allow_blank=allow_blank, showErrorMessage=True,
                        errorTitle="Invalid entry", error="Pick a value from the dropdown (edit the Lists sheet to add new ones).")
    ws.add_data_validation(dv); dv.add(rng)

def status_cf(ws, rng):
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Done"'], fill=PatternFill("solid", fgColor="C6EFCE"), font=Font(name=FONT, size=10, color="006100")))
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Blocked"'], fill=PatternFill("solid", fgColor="FFC7CE"), font=Font(name=FONT, size=10, color="9C0006")))
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"On Hold"'], fill=PatternFill("solid", fgColor="FFEB9C"), font=Font(name=FONT, size=10, color="9C5700")))
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"In Progress"'], fill=PatternFill("solid", fgColor="DDEBF7"), font=Font(name=FONT, size=10, color="1F3864")))
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Cancelled"'], font=Font(name=FONT, size=10, color="808080", strike=True)))

def priority_cf(ws, rng):
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Critical"'], font=Font(name=FONT, size=10, bold=True, color="C00000")))
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"High"'], font=Font(name=FONT, size=10, bold=True, color="ED7D31")))

def rag_cf(ws, rng):
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Green"'], fill=PatternFill("solid", fgColor="C6EFCE")))
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Amber"'], fill=PatternFill("solid", fgColor="FFEB9C")))
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Red"'], fill=PatternFill("solid", fgColor="FFC7CE")))

MAXP = 204   # projects rows 5..204
MAXT = 504   # tasks rows 5..504
MAXM = 54    # team rows 5..54

# ---------------------------------------------------------------- Team
ws_m = wb.create_sheet("Team")
header_block(ws_m, "Team",
    "Type in white cells (A-E). Grey columns are formulas pulled from the Tasks sheet - do not overwrite. Row 5 is you; keep your name identical to Lists!K4.",
    ["Name", "Role", "Primary Skills", "Location / Shift", "Notes", "Open Tasks", "In Progress", "Blocked", "Overdue", "Done (all time)"],
    [18, 26, 34, 16, 28, 11, 11, 10, 10, 12])
team = [
    ("Phani", "Integration Architect", "ACE 12, MQ, API design, governance", "Onsite", "Me"),
    ("Ravi Kumar", "Senior ACE Developer", "ESQL, JavaCompute, DFDL", "Offshore", "Sample row - replace"),
    ("Priya Nair", "ACE Developer", "ESQL, REST APIs, XMLNSC", "Offshore", "Sample row - replace"),
    ("Suresh Babu", "MQ Administrator", "MQ clusters, AIX, TLS", "Onsite", "Sample row - replace"),
    ("Anita Rao", "Test Lead", "SIT/UAT, SoapUI, Postman", "Offshore", "Sample row - replace"),
]
for i, row in enumerate(team, start=5):
    for ci, v in enumerate(row, start=1):
        ws_m.cell(row=i, column=ci, value=v)
T = "Tasks"
for r in range(5, MAXM + 1):
    ws_m[f"F{r}"] = f'=IF($A{r}="","",COUNTIFS({T}!$F$5:$F${MAXT},$A{r})-COUNTIFS({T}!$F$5:$F${MAXT},$A{r},{T}!$H$5:$H${MAXT},"Done")-COUNTIFS({T}!$F$5:$F${MAXT},$A{r},{T}!$H$5:$H${MAXT},"Cancelled"))'
    ws_m[f"G{r}"] = f'=IF($A{r}="","",COUNTIFS({T}!$F$5:$F${MAXT},$A{r},{T}!$H$5:$H${MAXT},"In Progress"))'
    ws_m[f"H{r}"] = f'=IF($A{r}="","",COUNTIFS({T}!$F$5:$F${MAXT},$A{r},{T}!$H$5:$H${MAXT},"Blocked"))'
    ws_m[f"I{r}"] = f'=IF($A{r}="","",COUNTIFS({T}!$F$5:$F${MAXT},$A{r},{T}!$M$5:$M${MAXT},"OVERDUE"))'
    ws_m[f"J{r}"] = f'=IF($A{r}="","",COUNTIFS({T}!$F$5:$F${MAXT},$A{r},{T}!$H$5:$H${MAXT},"Done"))'
style_rows(ws_m, 5, MAXM, 10, calc_cols=(6, 7, 8, 9, 10))
ws_m.conditional_formatting.add(f"I5:I{MAXM}", CellIsRule(operator="greaterThan", formula=["0"], fill=PatternFill("solid", fgColor="FFC7CE"), font=Font(name=FONT, size=10, bold=True, color="9C0006")))
ws_m.conditional_formatting.add(f"H5:H{MAXM}", CellIsRule(operator="greaterThan", formula=["0"], fill=PatternFill("solid", fgColor="FFEB9C")))
ws_m.auto_filter.ref = f"A4:J{MAXM}"
TEAM_REF = f"=Team!$A$5:$A${MAXM}"

# ---------------------------------------------------------------- Projects
ws_p = wb.create_sheet("Projects")
header_block(ws_p, "Projects",
    "One row per project. Type in white cells; dropdowns come from the Lists sheet. Grey columns (K-O) are calculated from the Tasks sheet - do not overwrite.",
    ["Project ID", "Project Name", "Business Unit / Client", "Type", "Priority", "Status", "Lead", "Start", "Target Go-Live",
     "RAG", "Total Tasks", "Done", "Open", "Overdue", "% Complete", "Next Milestone", "Notes / Risks"],
    [11, 36, 20, 17, 10, 12, 14, 13, 13, 8, 9, 8, 8, 9, 10, 30, 40])
projects = [
    ("PRJ-001", "SAP to Salesforce order sync (ACE 12)", "Sales Ops", "ACE Integration", "High", "In Progress", "Phani", d(-40), d(35), "Amber",
     "SIT sign-off", "Sample row - replace. Salesforce sandbox refresh slipped one week."),
    ("PRJ-002", "ACE 12.0.12 fixpack rollout on AIX 7.3", "Platform", "Upgrade / Fixpack", "Critical", "UAT", "Phani", d(-20), d(14), "Green",
     "PROD change window", "Sample row - replace. CAB approval pending."),
    ("PRJ-003", "MQ cluster consolidation (QM03/QM04)", "Platform", "MQ", "Medium", "Initiation", "Suresh Babu", d(-5), d(90), "Green",
     "Design review", "Sample row - replace."),
    ("PRJ-004", "Payments REST API via NGINX gateway", "Finance", "API Gateway", "High", "On Hold", "Phani", d(-60), d(60), "Red",
     "Security review", "Sample row - replace. Blocked on client cert issuance from InfoSec."),
]
for i, row in enumerate(projects, start=5):
    vals = list(row[:10]) + [None] * 5 + list(row[10:])
    for ci, v in enumerate(vals, start=1):
        if v is not None: ws_p.cell(row=i, column=ci, value=v)
for r in range(5, MAXP + 1):
    ws_p[f"K{r}"] = f'=IF($A{r}="","",COUNTIF({T}!$B$5:$B${MAXT},$A{r}))'
    ws_p[f"L{r}"] = f'=IF($A{r}="","",COUNTIFS({T}!$B$5:$B${MAXT},$A{r},{T}!$H$5:$H${MAXT},"Done"))'
    ws_p[f"M{r}"] = f'=IF($A{r}="","",K{r}-L{r}-COUNTIFS({T}!$B$5:$B${MAXT},$A{r},{T}!$H$5:$H${MAXT},"Cancelled"))'
    ws_p[f"N{r}"] = f'=IF($A{r}="","",COUNTIFS({T}!$B$5:$B${MAXT},$A{r},{T}!$M$5:$M${MAXT},"OVERDUE"))'
    ws_p[f"O{r}"] = f'=IF(OR($A{r}="",K{r}=0),"",L{r}/(K{r}-COUNTIFS({T}!$B$5:$B${MAXT},$A{r},{T}!$H$5:$H${MAXT},"Cancelled")))'
style_rows(ws_p, 5, MAXP, 17, calc_cols=(11, 12, 13, 14, 15), date_cols=(8, 9), pct_cols=(15,))
ws_p["O4"].comment = Comment("Done / (Total - Cancelled). Blank until the project has at least one task.", "Tracker")
add_dv(ws_p, f"D5:D{MAXP}", list_ref("Project Type"))
add_dv(ws_p, f"E5:E{MAXP}", list_ref("Priority"))
add_dv(ws_p, f"F5:F{MAXP}", list_ref("Project Status"))
add_dv(ws_p, f"G5:G{MAXP}", TEAM_REF)
add_dv(ws_p, f"J5:J{MAXP}", list_ref("RAG"))
priority_cf(ws_p, f"E5:E{MAXP}")
rag_cf(ws_p, f"J5:J{MAXP}")
ws_p.conditional_formatting.add(f"F5:F{MAXP}", CellIsRule(operator="equal", formula=['"Closed"'], fill=PatternFill("solid", fgColor="C6EFCE"), font=Font(name=FONT, size=10, color="006100")))
ws_p.conditional_formatting.add(f"F5:F{MAXP}", CellIsRule(operator="equal", formula=['"On Hold"'], fill=PatternFill("solid", fgColor="FFEB9C"), font=Font(name=FONT, size=10, color="9C5700")))
ws_p.conditional_formatting.add(f"N5:N{MAXP}", CellIsRule(operator="greaterThan", formula=["0"], fill=PatternFill("solid", fgColor="FFC7CE"), font=Font(name=FONT, size=10, bold=True, color="9C0006")))
# target go-live in the past and not closed
ws_p.conditional_formatting.add(f"I5:I{MAXP}", FormulaRule(formula=[f'AND($I5<>"",$I5<TODAY(),$F5<>"Closed")'], font=Font(name=FONT, size=10, bold=True, color="C00000")))
ws_p.auto_filter.ref = f"A4:Q{MAXP}"
PROJ_REF = f"=Projects!$A$5:$A${MAXP}"

# ---------------------------------------------------------------- Tasks
ws_t = wb.create_sheet(T)
header_block(ws_t, "Tasks (mine and the team's)",
    "One row per task. Set Assigned To = your name (Lists!K4) for your own tasks; the Dashboard splits them from the team's. Grey columns C, L, M are formulas - do not overwrite. Filter by Assigned To to see one person's list.",
    ["Task ID", "Project ID", "Project Name", "Task", "Category", "Assigned To", "Priority", "Status",
     "Created", "Due", "Completed", "Days Left", "Overdue?", "Blocker / Dependency", "Last Update", "Notes"],
    [9, 11, 30, 44, 12, 14, 10, 12, 12, 12, 12, 9, 10, 30, 12, 36])
tasks = [
    ("TSK-001", "PRJ-001", "Review ESQL mapping for order header/line items", "Review", "Phani", "High", "In Progress", d(-10), d(2), None, "", d(-1), "Sample row - replace"),
    ("TSK-002", "PRJ-001", "Build SAP IDoc DFDL model and ACE compute node", "Build", "Ravi Kumar", "High", "Done", d(-30), d(-8), d(-9), "", d(-9), ""),
    ("TSK-003", "PRJ-001", "Salesforce REST callout with OAuth policy", "Build", "Priya Nair", "High", "Blocked", d(-15), d(-2), None, "Waiting on Salesforce sandbox refresh", d(-3), ""),
    ("TSK-004", "PRJ-001", "SIT test cases for order sync happy path + retries", "Testing", "Anita Rao", "Medium", "In Progress", d(-7), d(10), None, "", d(0), ""),
    ("TSK-005", "PRJ-002", "Backup nodes and BARs before fixpack apply", "Deployment", "Suresh Babu", "Critical", "Done", d(-12), d(-5), d(-5), "", d(-5), ""),
    ("TSK-006", "PRJ-002", "Apply 12.0.12 fixpack on UAT integration nodes", "Deployment", "Ravi Kumar", "Critical", "Done", d(-10), d(-3), d(-3), "", d(-3), ""),
    ("TSK-007", "PRJ-002", "Regression run on UAT after fixpack", "Testing", "Anita Rao", "Critical", "In Progress", d(-3), d(4), None, "", d(0), ""),
    ("TSK-008", "PRJ-002", "Raise CAB change for PROD fixpack window", "Governance", "Phani", "Critical", "Not Started", d(-2), d(6), None, "", None, ""),
    ("TSK-009", "PRJ-003", "Current-state MQ topology and channel inventory", "Design", "Suresh Babu", "Medium", "In Progress", d(-5), d(12), None, "", d(-1), ""),
    ("TSK-010", "PRJ-003", "Consolidation design review with platform team", "Meeting", "Phani", "Medium", "Not Started", d(-5), d(20), None, "", None, ""),
    ("TSK-011", "PRJ-004", "Chase InfoSec for gateway client certificates", "Governance", "Phani", "High", "Blocked", d(-30), d(-14), None, "InfoSec ticket SEC-4412 open 3 weeks", d(-7), "Escalate to InfoSec manager if no reply this week"),
    ("TSK-012", "PRJ-004", "NGINX upstream config for ACE HTTPS listener", "Build", "Priya Nair", "Medium", "On Hold", d(-25), d(30), None, "Depends on TSK-011", d(-7), ""),
    ("TSK-013", "", "Monthly architecture governance forum - prep slides", "Governance", "Phani", "Medium", "Not Started", d(0), d(5), None, "", None, "Non-project task: leave Project ID blank"),
]
for i, row in enumerate(tasks, start=5):
    tid, pid, task, cat, who, pri, st, created, due, comp, blk, upd, notes = row
    vals = {1: tid, 2: pid, 4: task, 5: cat, 6: who, 7: pri, 8: st, 9: created, 10: due, 11: comp, 14: blk, 15: upd, 16: notes}
    for ci, v in vals.items():
        if v not in (None, ""): ws_t.cell(row=i, column=ci, value=v)
for r in range(5, MAXT + 1):
    ws_t[f"C{r}"] = f'=IF($B{r}="","",IFERROR(INDEX(Projects!$B$5:$B${MAXP},MATCH($B{r},Projects!$A$5:$A${MAXP},0)),"Unknown project ID"))'
    ws_t[f"L{r}"] = f'=IF(OR($J{r}="",$H{r}="Done",$H{r}="Cancelled"),"",$J{r}-TODAY())'
    ws_t[f"M{r}"] = f'=IF(AND($J{r}<>"",$H{r}<>"Done",$H{r}<>"Cancelled",$J{r}<TODAY()),"OVERDUE","")'
style_rows(ws_t, 5, MAXT, 16, calc_cols=(3, 12, 13), date_cols=(9, 10, 11, 15), int_cols=(12,))
ws_t["L4"].comment = Comment("Due - today. Negative = overdue. Blank once Done or Cancelled.", "Tracker")
ws_t["M4"].comment = Comment("Shows OVERDUE when Due is in the past and status is not Done/Cancelled.", "Tracker")
add_dv(ws_t, f"B5:B{MAXT}", PROJ_REF)
add_dv(ws_t, f"E5:E{MAXT}", list_ref("Task Category"))
add_dv(ws_t, f"F5:F{MAXT}", TEAM_REF)
add_dv(ws_t, f"G5:G{MAXT}", list_ref("Priority"))
add_dv(ws_t, f"H5:H{MAXT}", list_ref("Task Status"))
status_cf(ws_t, f"H5:H{MAXT}")
priority_cf(ws_t, f"G5:G{MAXT}")
ws_t.conditional_formatting.add(f"M5:M{MAXT}", CellIsRule(operator="equal", formula=['"OVERDUE"'], fill=PatternFill("solid", fgColor="FFC7CE"), font=Font(name=FONT, size=10, bold=True, color="9C0006")))
ws_t.conditional_formatting.add(f"L5:L{MAXT}", CellIsRule(operator="lessThan", formula=["0"], font=Font(name=FONT, size=10, bold=True, color="C00000")))
ws_t.conditional_formatting.add(f"L5:L{MAXT}", FormulaRule(formula=[f'AND(ISNUMBER($L5),$L5>=0,$L5<={DUESOON})'], fill=PatternFill("solid", fgColor="FFEB9C")))
ws_t.conditional_formatting.add(f"C5:C{MAXT}", CellIsRule(operator="equal", formula=['"Unknown project ID"'], font=Font(name=FONT, size=10, bold=True, color="C00000")))
ws_t.auto_filter.ref = f"A4:P{MAXT}"

# ---------------------------------------------------------------- Deployments
ws_d = wb.create_sheet("Releases")
header_block(ws_d, "Release Log",
    "Which BAR / version is in which environment. Append a row per deployment; newest at the bottom. Filter by Application + Environment to see what is live.",
    ["Date", "Project ID", "Application / BAR", "Version", "Environment", "Node / Integration Server", "Deployed By", "Change Ref", "Result", "Notes"],
    [12, 11, 32, 12, 12, 26, 14, 14, 12, 40])
deps = [
    (d(-9), "PRJ-001", "SAP_SFDC_OrderSync.bar", "1.3.0", "SIT", "ACENODE01 / SIT_IS01", "Ravi Kumar", "CHG0041220", "Success", "Sample row - replace"),
    (d(-3), "PRJ-002", "ACE fixpack 12.0.12.0", "12.0.12.0", "UAT", "ACENODE02 / all servers", "Ravi Kumar", "CHG0041305", "Success", "Sample row - replace"),
    (d(-1), "PRJ-001", "SAP_SFDC_OrderSync.bar", "1.3.1", "SIT", "ACENODE01 / SIT_IS01", "Priya Nair", "CHG0041331", "Failed", "Sample row - replace. BIP2087E on deploy, policy project missing; redeployed 1.3.1 same day"),
]
for i, row in enumerate(deps, start=5):
    for ci, v in enumerate(row, start=1): ws_d.cell(row=i, column=ci, value=v)
MAXD = 504
style_rows(ws_d, 5, MAXD, 10, date_cols=(1,))
add_dv(ws_d, f"B5:B{MAXD}", PROJ_REF)
add_dv(ws_d, f"E5:E{MAXD}", list_ref("Environment"))
add_dv(ws_d, f"G5:G{MAXD}", TEAM_REF)
add_dv(ws_d, f"I5:I{MAXD}", list_ref("Deploy Result"))
ws_d.conditional_formatting.add(f"I5:I{MAXD}", CellIsRule(operator="equal", formula=['"Success"'], fill=PatternFill("solid", fgColor="C6EFCE"), font=Font(name=FONT, size=10, color="006100")))
ws_d.conditional_formatting.add(f"I5:I{MAXD}", CellIsRule(operator="notEqual", formula=['"Success"'], fill=PatternFill("solid", fgColor="FFC7CE"), font=Font(name=FONT, size=10, color="9C0006")))
ws_d.conditional_formatting.add(f"I5:I{MAXD}", CellIsRule(operator="equal", formula=['""'], fill=PatternFill("solid", fgColor="FFFFFF")))
ws_d.conditional_formatting.add(f"E5:E{MAXD}", CellIsRule(operator="equal", formula=['"PROD"'], font=Font(name=FONT, size=10, bold=True, color="C00000")))
ws_d.auto_filter.ref = f"A4:J{MAXD}"

# ---------------------------------------------------------------- Dashboard
ws = wb.create_sheet("Dashboard", 0)
ws["A1"] = "ABK Integration Team Dashboard"; ws["A1"].font = TITLE_FONT
ws["A2"] = "Everything on this sheet is calculated. Update Projects, Tasks and Team; this refreshes on recalc (F9 in Excel if calc is manual)."; ws["A2"].font = SUB_FONT
ws["A3"] = "As of"; ws["A3"].font = BOLD
ws["B3"] = "=TODAY()"; ws["B3"].number_format = DATE_FMT; ws["B3"].font = BOLD
ws["D3"] = "Tracking for"; ws["D3"].font = BOLD
ws["E3"] = f"={MYNAME}"; ws["E3"].font = BOLD
for col, w in zip("ABCDEFGHIJKL", [22, 12, 12, 12, 12, 3, 22, 12, 12, 12, 12, 12]):
    ws.column_dimensions[col].width = w

def section(ws, row, col, title, span):
    c = ws.cell(row=row, column=col, value=title); c.font = Font(name=FONT, bold=True, size=11, color="1F3864")
    for ci in range(col, col + span):
        ws.cell(row=row, column=ci).fill = SECTION_FILL

def hdr(ws, row, col, labels):
    for i, l in enumerate(labels):
        c = ws.cell(row=row, column=col + i, value=l)
        c.font = HDR_FONT; c.fill = HDR_FILL; c.border = BORDER
        c.alignment = Alignment(horizontal="center", wrap_text=True)

def cell(ws, row, col, val, fmt=None, bold=False, fill=None):
    c = ws.cell(row=row, column=col, value=val)
    c.font = BOLD if bold else BODY; c.border = BORDER
    if fmt: c.number_format = fmt
    if fill: c.fill = fill
    c.alignment = Alignment(horizontal="center" if col > 1 and col != 7 else "left")
    return c

PS = f"Projects!$F$5:$F${MAXP}"; PR = f"Projects!$J$5:$J${MAXP}"; PA = f"Projects!$A$5:$A${MAXP}"
TS = f"{T}!$H$5:$H${MAXT}"; TW = f"{T}!$F$5:$F${MAXT}"; TO = f"{T}!$M$5:$M${MAXT}"; TD = f"{T}!$J$5:$J${MAXT}"; TP = f"{T}!$G$5:$G${MAXT}"; TA = f"{T}!$A$5:$A${MAXT}"

# --- Projects by status (A5)
r = 5
section(ws, r, 1, "Projects by status", 5)
hdr(ws, r + 1, 1, ["Status", "Count", "Green", "Amber", "Red"])
for i, s in enumerate(LISTS["Project Status"]):
    rr = r + 2 + i
    cell(ws, rr, 1, s)
    cell(ws, rr, 2, f'=COUNTIF({PS},$A{rr})')
    for j, rag in enumerate(LISTS["RAG"]):
        cell(ws, rr, 3 + j, f'=COUNTIFS({PS},$A{rr},{PR},"{rag}")')
rr = r + 2 + len(LISTS["Project Status"])
cell(ws, rr, 1, "Total", bold=True)
cell(ws, rr, 2, f'=COUNTA({PA})', bold=True)
for j, rag in enumerate(LISTS["RAG"]):
    cell(ws, rr, 3 + j, f'=COUNTIF({PR},"{rag}")', bold=True)
ws.conditional_formatting.add(f"E{r+2}:E{rr}", CellIsRule(operator="greaterThan", formula=["0"], fill=PatternFill("solid", fgColor="FFC7CE"), font=Font(name=FONT, size=10, bold=True, color="9C0006")))
ws.conditional_formatting.add(f"D{r+2}:D{rr}", CellIsRule(operator="greaterThan", formula=["0"], fill=PatternFill("solid", fgColor="FFEB9C")))
proj_end = rr

# --- Tasks by status: mine vs team (G5)
r = 5
section(ws, r, 7, "Tasks by status", 5)
hdr(ws, r + 1, 7, ["Status", "Mine", "Team", "Total", "Overdue"])
for i, s in enumerate(LISTS["Task Status"]):
    rr = r + 2 + i
    cell(ws, rr, 7, s)
    cell(ws, rr, 8, f'=COUNTIFS({TS},$G{rr},{TW},{MYNAME})')
    cell(ws, rr, 9, f'=COUNTIF({TS},$G{rr})-H{rr}')
    cell(ws, rr, 10, f'=H{rr}+I{rr}')
    cell(ws, rr, 11, f'=COUNTIFS({TS},$G{rr},{TO},"OVERDUE")')
rr = r + 2 + len(LISTS["Task Status"])
cell(ws, rr, 7, "Total", bold=True)
cell(ws, rr, 8, f'=SUM(H{r+2}:H{rr-1})', bold=True)
cell(ws, rr, 9, f'=SUM(I{r+2}:I{rr-1})', bold=True)
cell(ws, rr, 10, f'=SUM(J{r+2}:J{rr-1})', bold=True)
cell(ws, rr, 11, f'=SUM(K{r+2}:K{rr-1})', bold=True)
ws.conditional_formatting.add(f"K{r+2}:K{rr}", CellIsRule(operator="greaterThan", formula=["0"], fill=PatternFill("solid", fgColor="FFC7CE"), font=Font(name=FONT, size=10, bold=True, color="9C0006")))
task_end = rr

# --- Attention needed (A15)
r = max(proj_end, task_end) + 2
section(ws, r, 1, "Needs attention", 5)
hdr(ws, r + 1, 1, ["Signal", "Mine", "Team", "Total", ""])
OPEN = f'{TS},"<>Done",{TS},"<>Cancelled"'
signals = [
    ("Overdue tasks", f'=COUNTIFS({TO},"OVERDUE",{TW},{MYNAME})', f'=COUNTIF({TO},"OVERDUE")-B{{r}}'),
    ("Due within window (Lists!K5 days)", f'=COUNTIFS({OPEN},{TD},">="&TODAY(),{TD},"<="&TODAY()+{DUESOON},{TW},{MYNAME})', f'=COUNTIFS({OPEN},{TD},">="&TODAY(),{TD},"<="&TODAY()+{DUESOON})-B{{r}}'),
    ("Blocked tasks", f'=COUNTIFS({TS},"Blocked",{TW},{MYNAME})', f'=COUNTIF({TS},"Blocked")-B{{r}}'),
    ("Open Critical / High tasks", f'=COUNTIFS({OPEN},{TP},"Critical",{TW},{MYNAME})+COUNTIFS({OPEN},{TP},"High",{TW},{MYNAME})', f'=COUNTIFS({OPEN},{TP},"Critical")+COUNTIFS({OPEN},{TP},"High")-B{{r}}'),
    ("Open tasks with no due date", f'=COUNTIFS({OPEN},{TD},"",{TW},{MYNAME},{TA},"<>")', f'=COUNTIFS({OPEN},{TD},"",{TA},"<>")-B{{r}}'),
    ("Open tasks with no owner", "", f'=COUNTIFS({OPEN},{TW},"",{TA},"<>")'),
]
for i, (label, mine, teamf) in enumerate(signals):
    rr = r + 2 + i
    cell(ws, rr, 1, label)
    cell(ws, rr, 2, mine.format(r=rr) if mine else "")
    cell(ws, rr, 3, teamf.format(r=rr))
    cell(ws, rr, 4, f'=SUM(B{rr}:C{rr})', bold=True)
    cell(ws, rr, 5, "")
att_end = r + 1 + len(signals)
ws.conditional_formatting.add(f"B{r+3}:D{r+3}", CellIsRule(operator="greaterThan", formula=["0"], fill=PatternFill("solid", fgColor="FFEB9C"), font=Font(name=FONT, size=10, bold=True, color="9C5700")))
ws.conditional_formatting.add(f"B{r+2}:D{r+2}", CellIsRule(operator="greaterThan", formula=["0"], fill=PatternFill("solid", fgColor="FFC7CE"), font=Font(name=FONT, size=10, bold=True, color="9C0006")))
ws.conditional_formatting.add(f"B{r+4}:D{att_end}", CellIsRule(operator="greaterThan", formula=["0"], fill=PatternFill("solid", fgColor="FFC7CE"), font=Font(name=FONT, size=10, bold=True, color="9C0006")))

# --- Team workload (G15)
section(ws, r, 7, "Team workload", 5)
hdr(ws, r + 1, 7, ["Name", "Open", "In Progress", "Blocked", "Overdue"])
NSHOW = 10
for i in range(NSHOW):
    rr = r + 2 + i
    tr = 5 + i
    cell(ws, rr, 7, f'=IF(Team!$A{tr}="","",Team!$A{tr})')
    cell(ws, rr, 8, f'=IF(Team!$A{tr}="","",Team!$F{tr})')
    cell(ws, rr, 9, f'=IF(Team!$A{tr}="","",Team!$G{tr})')
    cell(ws, rr, 10, f'=IF(Team!$A{tr}="","",Team!$H{tr})')
    cell(ws, rr, 11, f'=IF(Team!$A{tr}="","",Team!$I{tr})')
wl_end = r + 1 + NSHOW
ws.conditional_formatting.add(f"K{r+2}:K{wl_end}", CellIsRule(operator="greaterThan", formula=["0"], fill=PatternFill("solid", fgColor="FFC7CE"), font=Font(name=FONT, size=10, bold=True, color="9C0006")))
ws.conditional_formatting.add(f"J{r+2}:J{wl_end}", CellIsRule(operator="greaterThan", formula=["0"], fill=PatternFill("solid", fgColor="FFEB9C")))
ws.cell(row=wl_end + 1, column=7, value="Shows the first 10 rows of the Team sheet; see Team for the full list.").font = SUB_FONT

# --- Project health (A25)
r = max(att_end, wl_end) + 3
section(ws, r, 1, "Project health (first 10 projects; see Projects sheet for all)", 11)
hdr(ws, r + 1, 1, ["Project ID", "Status", "RAG", "Open", "Overdue", "", "Project name", "Lead", "Target Go-Live", "Days to Go-Live", "% Complete"])
for i in range(10):
    rr = r + 2 + i; pr = 5 + i
    cell(ws, rr, 1, f'=IF(Projects!$A{pr}="","",Projects!$A{pr})')
    cell(ws, rr, 2, f'=IF(Projects!$A{pr}="","",Projects!$F{pr})')
    cell(ws, rr, 3, f'=IF(Projects!$A{pr}="","",Projects!$J{pr})')
    cell(ws, rr, 4, f'=IF(Projects!$A{pr}="","",Projects!$M{pr})')
    cell(ws, rr, 5, f'=IF(Projects!$A{pr}="","",Projects!$N{pr})')
    ws.cell(row=rr, column=6).border = Border()
    cell(ws, rr, 7, f'=IF(Projects!$A{pr}="","",Projects!$B{pr})')
    cell(ws, rr, 8, f'=IF(Projects!$A{pr}="","",Projects!$G{pr})')
    cell(ws, rr, 9, f'=IF(Projects!$A{pr}="","",Projects!$I{pr})', fmt=DATE_FMT)
    cell(ws, rr, 10, f'=IF(OR(Projects!$A{pr}="",Projects!$I{pr}="",Projects!$F{pr}="Closed"),"",Projects!$I{pr}-TODAY())', fmt="0")
    cell(ws, rr, 11, f'=IF(Projects!$A{pr}="","",Projects!$O{pr})', fmt="0%")
ph_end = r + 11
rag_cf(ws, f"C{r+2}:C{ph_end}")
ws.conditional_formatting.add(f"E{r+2}:E{ph_end}", CellIsRule(operator="greaterThan", formula=["0"], fill=PatternFill("solid", fgColor="FFC7CE"), font=Font(name=FONT, size=10, bold=True, color="9C0006")))
ws.conditional_formatting.add(f"J{r+2}:J{ph_end}", CellIsRule(operator="lessThan", formula=["0"], font=Font(name=FONT, size=10, bold=True, color="C00000")))
ws.conditional_formatting.add(f"J{r+2}:J{ph_end}", FormulaRule(formula=[f'AND(ISNUMBER($J{r+2}),$J{r+2}>=0,$J{r+2}<=14)'], fill=PatternFill("solid", fgColor="FFEB9C")))
ws.freeze_panes = "A5"
ws.sheet_view.showGridLines = False

# ---------------------------------------------------------------- Read Me
ws_r = wb.create_sheet("Read Me", 0)
ws_r.column_dimensions["A"].width = 24; ws_r.column_dimensions["B"].width = 110
ws_r["A1"] = "ABK Integration Team Tracker"; ws_r["A1"].font = TITLE_FONT
ws_r["A2"] = "ABK Integration Team tracker: projects, tasks (yours and the team's), team workload and a release log. Single source for the team's IBM ACE / MQ work."; ws_r["A2"].font = SUB_FONT
rows = [
    ("How it fits together", ""),
    ("Projects", "One row per project. Task counts and % complete are calculated from the Tasks sheet by Project ID."),
    ("Tasks", "One row per task, yours and the team's. Assigned To = the name in Lists!K4 marks a task as yours. Filter column F to see one person's list."),
    ("Team", "One row per person. Open / blocked / overdue counts are calculated from Tasks. Add people here first so they appear in the Assigned To dropdown."),
    ("Releases", "Append-only log of which BAR / version went to which environment. No formulas."),
    ("Dashboard", "All formulas. Nothing to type. Shows projects by status and RAG, tasks by status split mine vs team, attention signals, team workload, project health."),
    ("Lists", "Dropdown vocab and two settings: your name (K4) and the 'due soon' window in days (K5)."),
    ("", ""),
    ("Colour legend", ""),
    ("White cells", "Type here. Dropdowns are enforced; edit the Lists sheet to add values."),
    ("Grey cells", "Formulas. Do not overwrite. If you paste over one, copy it down again from a neighbouring row."),
    ("Yellow cells (Lists)", "Settings you are expected to change."),
    ("Red / amber / green", "Automatic: Overdue, Blocked, RAG, Critical priority, due-soon highlights."),
    ("", ""),
    ("Daily routine", ""),
    ("1", "Open Dashboard. Anything red in 'Needs attention' is today's list."),
    ("2", "Update Status, Last Update and Blocker on the Tasks sheet. Set Completed when a task is Done."),
    ("3", "New task: add a row at the bottom of Tasks; give it the next TSK number and a Project ID from the dropdown. Formulas in C, L, M are pre-filled to row 504."),
    ("4", "Weekly: update RAG and Next Milestone on Projects."),
    ("", ""),
    ("Limits and assumptions", ""),
    ("Capacity", "Formulas cover 200 projects, 500 tasks, 50 team members, 500 releases. Copy the formula rows down to extend."),
    ("Sample data", "Rows marked 'Sample row - replace' on Projects, Tasks, Team, Releases are placeholders showing the expected format. Delete them before real use."),
    ("Dates", "Days Left and Overdue use TODAY(); they change every time the file is opened. Excel needs automatic calculation on (Formulas > Calculation Options)."),
    ("Ownership", "Assumes this workbook is the only tracker. If the team logs work in Jira / ServiceNow / ADO, keep only projects and milestones here or it will drift."),
    ("Effort", "No estimated / actual hours by design. Add columns to Tasks if you need effort reporting."),
    ("Sharing", "No sheet protection, so it can sit on SharePoint / OneDrive and be updated by the team. Grey columns are the ones to keep hands off."),
]
for i, (a, b) in enumerate(rows, start=4):
    ca = ws_r.cell(row=i, column=1, value=a); cb = ws_r.cell(row=i, column=2, value=b)
    ca.font = BOLD if b == "" and a else BODY; cb.font = BODY
    cb.alignment = Alignment(wrap_text=True, vertical="top"); ca.alignment = Alignment(vertical="top")
    if b == "" and a:
        ca.fill = SECTION_FILL; cb.fill = SECTION_FILL; ca.font = Font(name=FONT, bold=True, size=11, color="1F3864")
ws_r["A13"].fill = PatternFill("solid", fgColor="FFFFFF"); ws_r["A14"].fill = CALC_FILL
ws_r["A15"].fill = PatternFill("solid", fgColor="FFFF00")
ws_r.sheet_view.showGridLines = False

order=["Read Me","Dashboard","Projects","Tasks","Team","Releases","Lists"]
wb._sheets=[wb[n] for n in order]
wb.active=1
print(wb.sheetnames)
wb.save(OUT)
print("saved", OUT)
