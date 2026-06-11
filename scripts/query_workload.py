import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), '..', 'server', 'Commtrac.Api', 'commtrac.db')

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Find Steven Rutherford
cur.execute("SELECT Id, FullName, Role FROM Users WHERE FullName LIKE '%Steven%' OR FullName LIKE '%Rutherford%'")
users = cur.fetchall()
print("=== Users matching Steven/Rutherford ===")
for u in users:
    print(f"  ID: {u['Id']}, Name: {u['FullName']}, Role: {u['Role']}")

# Get all project managers
cur.execute("SELECT Id, FullName FROM Users WHERE Role = 'Project Manager' OR Role = 'Admin'")
pms = cur.fetchall()
print("\n=== Project Managers ===")
for pm in pms:
    print(f"  ID: {pm['Id']}, Name: {pm['FullName']}")

# For each PM, count their assets
print("\n=== Assets by PM (projects they manage) ===")
for pm in pms:
    # Get projects managed by this PM
    cur.execute("SELECT Id, JobNumber FROM Projects WHERE ProjectManager = ?", (pm['FullName'],))
    projects = cur.fetchall()
    project_ids = [p['Id'] for p in projects]
    
    if project_ids:
        # Count active assets in those projects
        placeholders = ','.join(['?' for _ in project_ids])
        cur.execute(f"""
            SELECT Status, COUNT(*) as cnt 
            FROM ProjectAssets 
            WHERE ProjectId IN ({placeholders}) 
            AND Status != 'Complete' AND Status != 'Completed' AND Status != 'Cancelled'
            GROUP BY Status
        """, project_ids)
        status_counts = cur.fetchall()
        total = sum(sc['cnt'] for sc in status_counts)
        print(f"\n  {pm['FullName']}: {len(projects)} projects, {total} active assets")
        for sc in status_counts:
            print(f"    - {sc['Status']}: {sc['cnt']}")

# Get technician workload summary - all technicians with active assets
print("\n=== Technician Workload (all technicians with active assets) ===")
cur.execute("""
    SELECT u.FullName, pa.Status, COUNT(*) as cnt
    FROM ProjectAssets pa
    JOIN Users u ON pa.AssignedUserId = u.Id
    WHERE pa.Status != 'Complete' AND pa.Status != 'Completed' AND pa.Status != 'Cancelled'
    GROUP BY u.FullName, pa.Status
    ORDER BY u.FullName, pa.Status
""")
workload = cur.fetchall()

tech_totals = {}
for w in workload:
    name = w['FullName']
    if name not in tech_totals:
        tech_totals[name] = {'total': 0, 'statuses': {}}
    tech_totals[name]['total'] += w['cnt']
    tech_totals[name]['statuses'][w['Status']] = w['cnt']

for name, data in sorted(tech_totals.items(), key=lambda x: -x[1]['total']):
    print(f"\n  {name}: {data['total']} total assets")
    for status, cnt in sorted(data['statuses'].items()):
        print(f"    - {status}: {cnt}")

conn.close()