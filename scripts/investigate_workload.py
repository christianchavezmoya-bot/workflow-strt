import sqlite3
import os
import json

db_path = os.path.join(os.path.dirname(__file__), '..', 'server', 'Commtrac.Api', 'commtrac.db')

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Find Steven Rutherford (PM)
cur.execute("SELECT Id, FullName FROM Users WHERE FullName LIKE '%Steven%Rutherford%'")
steven = cur.fetchone()
print(f"=== Steven Rutherford (PM) ===")
print(f"  ID: {steven['Id']}, Name: {steven['FullName']}")

# Get projects managed by Steven
cur.execute("SELECT Id, JobNumber, CustomerName, Status FROM Projects WHERE ProjectManager = ?", (steven['FullName'],))
projects = cur.fetchall()
print(f"\n=== Projects managed by Steven Rutherford ===")
for p in projects:
    print(f"  {p['JobNumber']} - {p['CustomerName']} (Status: {p['Status']})")

project_ids = [p['Id'] for p in projects]

# Get ALL assets in Steven's projects (regardless of status)
print(f"\n=== ALL Assets in Steven's Projects ===")
placeholders = ','.join(['?' for _ in project_ids])
cur.execute(f"""
    SELECT pa.Id, pa.AssetTag, pa.AssetName, pa.Status, pa.AssignedUserId, pa.ProjectId, p.JobNumber,
           u.FullName as AssignedUserName
    FROM ProjectAssets pa
    JOIN Projects p ON pa.ProjectId = p.Id
    LEFT JOIN Users u ON pa.AssignedUserId = u.Id
    WHERE pa.ProjectId IN ({placeholders})
    ORDER BY p.JobNumber, pa.AssetTag
""", project_ids)
all_assets = cur.fetchall()
print(f"Total assets: {len(all_assets)}")
for a in all_assets:
    print(f"  {a['JobNumber']}: {a['AssetTag']} - Status: {a['Status']}, Assigned: {a['AssignedUserName'] or 'UNASSIGNED'}")

# Get active assets (not Complete/Cancelled)
print(f"\n=== ACTIVE Assets (not Complete/Cancelled) ===")
cur.execute(f"""
    SELECT pa.Id, pa.AssetTag, pa.AssetName, pa.Status, pa.AssignedUserId, pa.ProjectId, p.JobNumber,
           u.FullName as AssignedUserName
    FROM ProjectAssets pa
    JOIN Projects p ON pa.ProjectId = p.Id
    LEFT JOIN Users u ON pa.AssignedUserId = u.Id
    WHERE pa.ProjectId IN ({placeholders})
    AND pa.Status != 'Complete' AND pa.Status != 'Completed' AND pa.Status != 'Cancelled'
    ORDER BY p.JobNumber, pa.AssetTag
""", project_ids)
active_assets = cur.fetchall()
print(f"Total active assets: {len(active_assets)}")
for a in active_assets:
    print(f"  {a['JobNumber']}: {a['AssetTag']} - Status: {a['Status']}, Assigned: {a['AssignedUserName'] or 'UNASSIGNED'}")

# Check workflow runs for paused status
print(f"\n=== Workflow Runs (check for Paused) ===")
asset_ids = [a['Id'] for a in active_assets]
if asset_ids:
    placeholders = ','.join(['?' for _ in asset_ids])
    cur.execute(f"""
        SELECT r.Id, r.AssetId, r.Status, r.StartedAt, r.UpdatedAt,
               pa.AssetTag, p.JobNumber, u.FullName as AssignedUserName
        FROM AssetWorkflowRuns r
        JOIN ProjectAssets pa ON r.AssetId = pa.Id
        JOIN Projects p ON pa.ProjectId = p.Id
        LEFT JOIN Users u ON pa.AssignedUserId = u.Id
        WHERE r.AssetId IN ({placeholders})
        ORDER BY r.UpdatedAt DESC
    """, asset_ids)
    runs = cur.fetchall()
    print(f"Total runs: {len(runs)}")
    for r in runs:
        print(f"  {r['JobNumber']}: {r['AssetTag']} - Run Status: {r['Status']}, Asset Assigned: {r['AssignedUserName'] or 'UNASSIGNED'}")

# Get Christian Chavez's assets
print(f"\n=== Christian Chavez's Assigned Assets ===")
cur.execute("""
    SELECT pa.Id, pa.AssetTag, pa.AssetName, pa.Status, pa.ProjectId, p.JobNumber, p.ProjectManager
    FROM ProjectAssets pa
    JOIN Projects p ON pa.ProjectId = p.Id
    JOIN Users u ON pa.AssignedUserId = u.Id
    WHERE u.FullName = 'Christian Chavez'
""")
christian_assets = cur.fetchall()
print(f"Total assets assigned to Christian Chavez: {len(christian_assets)}")
for a in christian_assets:
    print(f"  {a['JobNumber']}: {a['AssetTag']} - Status: {a['Status']}, PM: {a['ProjectManager']}")

# Check for paused runs for Christian Chavez
print(f"\n=== Christian Chavez's Workflow Runs (check for Paused) ===")
cur.execute("""
    SELECT r.Id, r.AssetId, r.Status, r.StartedAt, r.UpdatedAt,
           pa.AssetTag, p.JobNumber, p.ProjectManager
    FROM AssetWorkflowRuns r
    JOIN ProjectAssets pa ON r.AssetId = pa.Id
    JOIN Projects p ON pa.ProjectId = p.Id
    JOIN Users u ON pa.AssignedUserId = u.Id
    WHERE u.FullName = 'Christian Chavez'
    ORDER BY r.UpdatedAt DESC
""")
christian_runs = cur.fetchall()
print(f"Total runs for Christian: {len(christian_runs)}")
for r in christian_runs:
    print(f"  {r['JobNumber']}: {r['AssetTag']} - Run Status: {r['Status']}, PM: {r['ProjectManager']}")

# Check if there are any paused runs
print(f"\n=== ALL Paused Runs in Database ===")
cur.execute("""
    SELECT r.Id, r.AssetId, r.Status,
           pa.AssetTag, pa.Status as AssetStatus, pa.AssignedUserId,
           p.JobNumber, p.ProjectManager,
           u.FullName as AssignedUserName
    FROM AssetWorkflowRuns r
    JOIN ProjectAssets pa ON r.AssetId = pa.Id
    JOIN Projects p ON pa.ProjectId = p.Id
    LEFT JOIN Users u ON pa.AssignedUserId = u.Id
    WHERE r.Status = 'Paused'
""")
paused_runs = cur.fetchall()
print(f"Total paused runs: {len(paused_runs)}")
for r in paused_runs:
    print(f"  {r['JobNumber']}: {r['AssetTag']} - Asset Status: {r['AssetStatus']}, Assigned: {r['AssignedUserName'] or 'UNASSIGNED'}, PM: {r['ProjectManager']}")

conn.close()